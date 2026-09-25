import { describe, expect, test } from 'vitest';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createPlanEditorService, type EditOutcome } from '../../src/server/plans/plan-editor-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripService } from '../../src/server/trips/trip-service';
import type { SavedPlan } from '../../src/shared/plan-schemas';
import { aDestination } from '../support/a-destination';
import { activityIn, aPlanView } from '../support/a-plan';
import { aTripInput, anOwner, TODAY } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock } from '../support/fixed-clock';
import { anAiDouble } from '../support/an-ai-double';

const TYPED = { title: 'Sunrise swim', startTime: '09:00', durationMinutes: 45, estimatedCost: 0, location: 'Kamo river' } as const;

function anEditorOverAPlannedTrip() {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const trips = createTripService({ db, clock });
  const store = createPlanStore({ db, clock });
  const editor = createPlanEditorService({ trips, store });
  const ownerId = anOwner(db);
  const created = trips.create(ownerId, aTripInput(createDestinationService({ db, clock }).add(aDestination()).id));
  if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
  const tripId = created.trip.id;
  const generated = store.save(tripId, aPlanView({ days: 8 }), 'generation');
  return { db, trips, store, editor, ownerId, tripId, generated };
}

function planOf(outcome: EditOutcome): SavedPlan {
  if (!outcome.ok) throw new Error(`Expected the edit to be saved, got ${outcome.error}`);
  return outcome.plan;
}

describe('saving a hand edit', () => {
  // @covers REQ-TRV-045@v1
  test('saves the edited Plan as a new version with the source edit, and the Trip reads it back', () => {
    const { editor, store, ownerId, tripId } = anEditorOverAPlannedTrip();

    const saved = planOf(editor.editActivity(ownerId, tripId, 'Plan A-day-1-morning', { startTime: '11:00' }));

    expect(saved).toMatchObject({ version: 2, source: 'edit' });
    expect(activityIn(store.current(tripId) as SavedPlan, 1, 0)).toMatchObject({ id: 'Plan A-day-1-morning', startTime: '11:00' });
  });

  // @covers REQ-TRV-045@v1
  test('keeps the Plan it changed as version 1, so the edit can be undone by restoring it', () => {
    const { editor, store, ownerId, tripId, generated } = anEditorOverAPlannedTrip();

    editor.editActivity(ownerId, tripId, 'Plan A-day-1-morning', { startTime: '11:00' });

    store.restore(tripId, 1);
    expect(store.current(tripId)?.days).toEqual(generated.days);
  });

  // @covers REQ-TRV-046@v1
  test('saves a removal as a new version with the Activity gone', () => {
    const { editor, ownerId, tripId } = anEditorOverAPlannedTrip();

    const saved = planOf(editor.removeActivity(ownerId, tripId, 'Plan A-day-2-lunch'));

    expect(saved.version).toBe(2);
    expect(saved.days[1]?.activities.map((a) => a.id)).toEqual(['Plan A-day-2-morning']);
  });

  // @covers REQ-TRV-048@v1
  test('saves a move as a new version with the Activity on its new Day', () => {
    const { editor, ownerId, tripId } = anEditorOverAPlannedTrip();

    const saved = planOf(editor.moveActivity(ownerId, tripId, 'Plan A-day-2-morning', 5));

    expect(saved.version).toBe(2);
    expect(saved.days[1]?.activities.map((a) => a.id)).toEqual(['Plan A-day-2-lunch']);
    expect(saved.days[4]?.activities.map((a) => a.id)).toContain('Plan A-day-2-morning');
  });

  // @covers REQ-TRV-047@v1
  test('saves a typed replacement as a new version, marked as changed by hand', () => {
    const { editor, ownerId, tripId } = anEditorOverAPlannedTrip();

    const saved = planOf(editor.replaceActivity(ownerId, tripId, 'Plan A-day-1-morning', TYPED, 'typed'));

    expect(saved.version).toBe(2);
    expect(activityIn(saved, 1, 0)).toMatchObject({ title: 'Sunrise swim', changedByHand: true });
  });

  // @covers REQ-TRV-047@v1
  test('saves an accepted AI suggestion as a replacement that is not marked as changed by hand', () => {
    const { editor, ownerId, tripId } = anEditorOverAPlannedTrip();

    const saved = planOf(editor.replaceActivity(ownerId, tripId, 'Plan A-day-1-morning', TYPED, 'suggestion'));

    expect(activityIn(saved, 1, 0).changedByHand).toBe(false);
  });

  // @covers REQ-TRV-045@v1
  test('keeps the ten-version limit, dropping the oldest, when edits push past it', () => {
    const { editor, store, ownerId, tripId } = anEditorOverAPlannedTrip();

    for (let made = 0; made < 10; made += 1) {
      editor.editActivity(ownerId, tripId, 'Plan A-day-1-morning', { estimatedCost: made });
    }

    expect(store.listVersions(tripId).map((v) => v.version)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  });
});

describe('an edit that cannot be made', () => {
  // @covers REQ-TRV-045@v1
  test('is refused for an Activity that is not in the Plan, and saves nothing', () => {
    const { editor, store, ownerId, tripId } = anEditorOverAPlannedTrip();

    expect(editor.editActivity(ownerId, tripId, 'nope', { startTime: '11:00' })).toEqual({ ok: false, error: 'activity-not-found' });
    expect(store.listVersions(tripId)).toHaveLength(1);
  });

  // @covers REQ-TRV-048@v1
  test('is refused for a move to a Day the Plan does not have, and saves nothing', () => {
    const { editor, store, ownerId, tripId } = anEditorOverAPlannedTrip();

    expect(editor.moveActivity(ownerId, tripId, 'Plan A-day-1-morning', 12)).toEqual({ ok: false, error: 'day-not-found' });
    expect(store.listVersions(tripId)).toHaveLength(1);
  });

  // @covers REQ-TRV-007@v2
  test("is refused for another Traveler's Trip, as if the Trip were not there", () => {
    const { db, editor, store, tripId } = anEditorOverAPlannedTrip();

    const outcome = editor.removeActivity(anOwner(db), tripId, 'Plan A-day-1-morning');

    expect(outcome).toEqual({ ok: false, error: 'trip-not-found' });
    expect(store.listVersions(tripId)).toHaveLength(1);
  });

  // @covers REQ-TRV-045@v1
  test('is refused for a Trip that has no Plan yet', () => {
    const { db, trips, editor, ownerId } = anEditorOverAPlannedTrip();
    const destinationId = createDestinationService({ db, clock: aFixedClock(TODAY) }).add(aDestination({ name: 'Osaka' })).id;
    const created = trips.create(ownerId, aTripInput(destinationId));
    if (!created.ok) throw new Error(created.error);

    expect(editor.removeActivity(ownerId, created.trip.id, 'anything')).toEqual({ ok: false, error: 'no-plan' });
  });
});

describe('changing a Plan while the AI is not responding', () => {
  // @covers REQ-TRV-103@v1
  test('saves an edit, a removal and a move as three versions, and the AI is never asked', () => {
    const { editor, store, ownerId, tripId } = anEditorOverAPlannedTrip();
    const ai = anAiDouble();
    ai.neverAnswer();

    const edit = editor.editActivity(ownerId, tripId, 'Plan A-day-1-morning', { startTime: '10:15' });
    const removal = editor.removeActivity(ownerId, tripId, 'Plan A-day-2-lunch');
    const move = editor.moveActivity(ownerId, tripId, 'Plan A-day-3-morning', 6);

    expect([edit.ok, removal.ok, move.ok]).toEqual([true, true, true]);
    expect(store.listVersions(tripId).map((v) => v.version)).toEqual([4, 3, 2, 1]);
    const current = store.current(tripId) as SavedPlan;
    expect(activityIn(current, 1, 0)).toMatchObject({ id: 'Plan A-day-1-morning', startTime: '10:15' });
    expect(current.days[1]?.activities.map((a) => a.id)).toEqual(['Plan A-day-2-morning']);
    expect(current.days[5]?.activities.map((a) => a.id)).toContain('Plan A-day-3-morning');
    expect(ai.requests).toHaveLength(0);
  });
});
