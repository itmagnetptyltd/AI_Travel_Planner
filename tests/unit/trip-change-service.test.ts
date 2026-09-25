import { describe, expect, test } from 'vitest';
import { requestTextOf } from '../../src/server/ai/ai-service';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createAiUsageLimitService } from '../../src/server/plans/ai-usage-limit-service';
import { createPlanEditorService } from '../../src/server/plans/plan-editor-service';
import { createPlanService, type PlanGenerationSettings } from '../../src/server/plans/plan-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripChangeService, type ChangeResult } from '../../src/server/trips/trip-change-service';
import { createTripService } from '../../src/server/trips/trip-service';
import { planNeedsReview } from '../../src/shared/plan-basis';
import type { SavedPlan } from '../../src/shared/plan-schemas';
import type { TripView } from '../../src/shared/trip-schemas';
import { aDestination } from '../support/a-destination';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';
import { aTripInput, anOwner, TODAY } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock } from '../support/fixed-clock';
import { anAiDouble } from '../support/an-ai-double';
import { generationsAlreadyMade } from '../support/an-ai-request';

const SETTINGS: PlanGenerationSettings = {
  timeoutMs: 1_000,
  destinationTextMaxChars: 2_000,
  maxOutputTokens: 8_000,
  inputCostMicroUsdPerMTok: 3_000_000,
  outputCostMicroUsdPerMTok: 15_000_000,
};

/** A Trip to Kyoto from 2026-10-10 to 2026-10-17 with a generated 8-Day Plan, and Osaka to change it to. */
async function aTripWithAPlan() {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const ai = anAiDouble();
  const trips = createTripService({ db, clock });
  const limits = createAiUsageLimitService({ db, clock });
  const destinations = createDestinationService({ db, clock });
  const store = createPlanStore({ db, clock });
  const plans = createPlanService({ db, clock, ai, trips, limits, store, settings: SETTINGS });
  const changes = createTripChangeService({ db, trips, store, plans });
  const editor = createPlanEditorService({ trips, store });
  const ownerId = anOwner(db);
  const kyotoId = destinations.add(aDestination({ name: 'Kyoto' })).id;
  const osakaId = destinations.add(aDestination({ name: 'Osaka', description: 'Street food and castles.' })).id;
  const created = trips.create(ownerId, aTripInput(kyotoId));
  if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
  const generated = await plans.generate(ownerId, created.trip.id);
  if (!generated.ok) throw new Error(`The first Plan failed: ${generated.error}`);
  // Read again: saving the first Plan made the Trip Planned.
  const trip = trips.getForOwner(ownerId, created.trip.id);
  if (!trip) throw new Error('The Trip is gone');
  return { db, clock, ai, trips, store, plans, changes, editor, destinations, ownerId, kyotoId, osakaId, trip, first: generated.plan, asked: ai.requests.length };
}

type Rig = Awaited<ReturnType<typeof aTripWithAPlan>>;

const tripNow = (rig: Rig): TripView => {
  const trip = rig.trips.getForOwner(rig.ownerId, rig.trip.id);
  if (!trip) throw new Error('The Trip is gone');
  return trip;
};

const savedTrip = (result: ChangeResult): TripView => {
  if (!result.ok) throw new Error(`Expected the change to be saved, got ${result.error}`);
  return result.trip;
};

const planNow = (rig: Rig): SavedPlan => {
  const plan = rig.store.current(rig.trip.id);
  if (!plan) throw new Error('The Plan is gone');
  return plan;
};

describe('changing the Destination of a Trip that has a Plan', () => {
  // @covers REQ-TRV-098@v1
  test('warns that the Plan will be regenerated, and changes neither the Trip nor the Plan, until it is confirmed', async () => {
    const rig = await aTripWithAPlan();

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { destinationId: rig.osakaId });

    expect(result).toEqual({ ok: false, error: 'needs-confirmation', effect: { kind: 'regenerate' } });
    expect(tripNow(rig)).toEqual(rig.trip);
    expect(planNow(rig)).toEqual(rig.first);
    expect(rig.ai.requests).toHaveLength(rig.asked);
  });

  // @covers REQ-TRV-098@v1
  test('once confirmed, sends the AI a request for Osaka, and the Trip shows the Plan it returned', async () => {
    const rig = await aTripWithAPlan();
    rig.ai.replyWith(aPlanReplyText({ days: Array.from({ length: 8 }, (_, i) => ({ dayNumber: i + 1, activities: [anActivity({ title: 'Osaka castle walk' })] })) }));

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { destinationId: rig.osakaId }, { confirmPlanChange: true });

    expect(savedTrip(result).destination).toMatchObject({ id: rig.osakaId, name: 'Osaka' });
    const sent = requestTextOf(rig.ai.requests.at(-1) ?? { system: '', user: '' });
    expect(sent).toContain('Destination: Osaka, Japan');
    expect(sent).not.toContain('Destination: Kyoto');
    expect(planNow(rig).days[0]?.activities[0]?.title).toBe('Osaka castle walk');
    expect(rig.store.listVersions(rig.trip.id).map((v) => [v.version, v.source])).toEqual([[2, 'trip-change'], [1, 'generation']]);
  });

  // @covers REQ-TRV-098@v1
  test('leaves the Trip on Kyoto, with its Plan, when the AI fails, so the Trip never disagrees with its Plan', async () => {
    const rig = await aTripWithAPlan();
    rig.ai.failWith();

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { destinationId: rig.osakaId }, { confirmPlanChange: true });

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
    expect(tripNow(rig)).toEqual(rig.trip);
    expect(planNow(rig)).toEqual(rig.first);
  });

  // @covers REQ-TRV-098@v1
  test('leaves the Trip on Kyoto, with its Plan, when the AI answers with something that is not a Plan', async () => {
    const rig = await aTripWithAPlan();
    rig.ai.replyWith('Osaka is lovely!');

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { destinationId: rig.osakaId }, { confirmPlanChange: true });

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
    expect(tripNow(rig)).toEqual(rig.trip);
  });

  // @covers REQ-TRV-098@v1
  test('leaves the Trip on Kyoto, with its Plan, at the daily limit, and says when it resets', async () => {
    const rig = await aTripWithAPlan();
    generationsAlreadyMade(rig.db, rig.ownerId, 19, new Date(TODAY.getTime() - 60_000));

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { destinationId: rig.osakaId }, { confirmPlanChange: true });

    expect(result).toMatchObject({ ok: false, error: 'limit-reached', limit: 20, resetsAt: new Date('2026-09-24T00:00:00Z') });
    expect(tripNow(rig)).toEqual(rig.trip);
  });

  // @covers REQ-TRV-098@v1
  test('replaces hand edits without a second warning, because the Traveler has confirmed the change', async () => {
    const rig = await aTripWithAPlan();
    const firstActivity = rig.first.days[0]?.activities[0]?.id ?? '';
    rig.editor.editActivity(rig.ownerId, rig.trip.id, firstActivity, { startTime: '11:11' });

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { destinationId: rig.osakaId }, { confirmPlanChange: true });

    expect(result.ok).toBe(true);
    expect(planNow(rig).days.flatMap((day) => day.activities).some((a) => a.changedByHand)).toBe(false);
  });

  // @covers REQ-TRV-098@v1
  test('asks the AI for the new dates, when the Destination and the dates change together', async () => {
    const rig = await aTripWithAPlan();
    rig.ai.replyWith(aPlanReplyText({ dayCount: 5 }));

    const result = await rig.changes.change(
      rig.ownerId,
      rig.trip.id,
      { destinationId: rig.osakaId, endDate: '2026-10-14' },
      { confirmPlanChange: true },
    );

    expect(savedTrip(result)).toMatchObject({ endDate: '2026-10-14', dayCount: 5 });
    expect(requestTextOf(rig.ai.requests.at(-1) ?? { system: '', user: '' })).toContain('2026-10-10 to 2026-10-14 (5 days)');
    expect(planNow(rig).days).toHaveLength(5);
  });

  // @covers REQ-TRV-098@v1
  test('saves nothing, and says the Trip changed, when the Trip is edited while the AI is answering', async () => {
    const rig = await aTripWithAPlan();
    rig.ai.replyWith(() => {
      rig.trips.update(rig.ownerId, rig.trip.id, { endDate: '2026-10-16' });
      return aPlanReplyText({ dayCount: 8 });
    });

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { destinationId: rig.osakaId }, { confirmPlanChange: true });

    expect(result).toEqual({ ok: false, error: 'trip-changed' });
    expect(tripNow(rig).destination.name).toBe('Kyoto');
  });

  // @covers REQ-TRV-098@v1
  test('is refused for a Destination that is disabled, and nothing is asked of the AI', async () => {
    const rig = await aTripWithAPlan();
    rig.destinations.setDisabled(rig.osakaId, true);

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { destinationId: rig.osakaId }, { confirmPlanChange: true });

    expect(result).toEqual({ ok: false, error: 'invalid', field: 'destinationId' });
    expect(rig.ai.requests).toHaveLength(rig.asked);
  });
});

describe('changing the dates of a Trip that has a Plan', () => {
  // @covers REQ-TRV-098@v1
  test('warns which Days will be dropped when an 8-Day Trip is shortened to 5, and saves nothing', async () => {
    const rig = await aTripWithAPlan();

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { endDate: '2026-10-14' });

    expect(result).toEqual({ ok: false, error: 'needs-confirmation', effect: { kind: 'drop-days', droppedDays: [6, 7, 8] } });
    expect(tripNow(rig)).toEqual(rig.trip);
    expect(planNow(rig)).toEqual(rig.first);
  });

  // @covers REQ-TRV-098@v1
  test('once confirmed, leaves a Plan of 5 Days with the same Activities as the former Days 1 to 5, in order', async () => {
    const rig = await aTripWithAPlan();

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { endDate: '2026-10-14' }, { confirmPlanChange: true });

    expect(savedTrip(result)).toMatchObject({ endDate: '2026-10-14', dayCount: 5 });
    expect(planNow(rig).days).toEqual(rig.first.days.slice(0, 5));
    expect(rig.ai.requests).toHaveLength(rig.asked);
    expect(rig.store.listVersions(rig.trip.id).map((v) => [v.version, v.source])).toEqual([[2, 'trip-change'], [1, 'generation']]);
  });

  // @covers REQ-TRV-098@v1
  test('keeps Days 1 to 8 as they were and adds Days 9 and 10 empty when the Trip is lengthened to 10 Days, with no warning', async () => {
    const rig = await aTripWithAPlan();

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { endDate: '2026-10-19' });

    expect(savedTrip(result)).toMatchObject({ endDate: '2026-10-19', dayCount: 10 });
    const plan = planNow(rig);
    expect(plan.days.slice(0, 8)).toEqual(rig.first.days);
    expect(plan.days.slice(8)).toEqual([
      { dayNumber: 9, date: '2026-10-18', activities: [] },
      { dayNumber: 10, date: '2026-10-19', activities: [] },
    ]);
    expect(rig.ai.requests).toHaveLength(rig.asked);
  });

  // @covers REQ-TRV-098@v1
  test('dates Day 1 as 2026-10-12 with the former Day 1 Activities when the Trip moves from 10-10 to 10-17 to 10-12 to 10-19', async () => {
    const rig = await aTripWithAPlan();

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { startDate: '2026-10-12', endDate: '2026-10-19' });

    expect(savedTrip(result)).toMatchObject({ startDate: '2026-10-12', endDate: '2026-10-19' });
    const plan = planNow(rig);
    expect(plan.days.map((day) => day.date)).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
      '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
    ]);
    expect(plan.days.map((day) => day.activities)).toEqual(rig.first.days.map((day) => day.activities));
    expect(rig.ai.requests).toHaveLength(rig.asked);
  });

  // @covers REQ-TRV-098@v1
  test('keeps a hand-changed Activity on its numbered Day when the Trip moves', async () => {
    const rig = await aTripWithAPlan();
    const onDay2 = rig.first.days[1]?.activities[0]?.id ?? '';
    rig.editor.editActivity(rig.ownerId, rig.trip.id, onDay2, { startTime: '11:11' });

    await rig.changes.change(rig.ownerId, rig.trip.id, { startDate: '2026-10-12', endDate: '2026-10-19' });

    expect(planNow(rig).days[1]?.activities.find((a) => a.id === onDay2)).toMatchObject({ startTime: '11:11', changedByHand: true });
  });

  // @covers REQ-TRV-098@v1
  test('is refused for dates that do not make a Trip, and the Plan is left alone', async () => {
    const rig = await aTripWithAPlan();

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { endDate: '2026-10-01' });

    expect(result).toEqual({ ok: false, error: 'invalid', field: 'endDate' });
    expect(planNow(rig)).toEqual(rig.first);
  });
});

describe('changing the travelers or the budget of a Trip that has a Plan', () => {
  // @covers REQ-TRV-098@v1
  test('leaves the Plan exactly as it was, and the Trip moves on from it', async () => {
    const rig = await aTripWithAPlan();

    const result = await rig.changes.change(rig.ownerId, rig.trip.id, { adults: 3, budget: 9000 });

    const trip = savedTrip(result);
    expect(trip).toMatchObject({ adults: 3, budget: 9000 });
    expect(planNow(rig)).toEqual(rig.first);
    expect(rig.store.listVersions(rig.trip.id)).toHaveLength(1);
    expect(planNeedsReview(planNow(rig), trip)).toBe(true);
    expect(rig.ai.requests).toHaveLength(rig.asked);
  });

  // @covers REQ-TRV-098@v1
  test('is noticed for a change of children alone, and for a change of budget alone', async () => {
    const rig = await aTripWithAPlan();

    const moreChildren = savedTrip(await rig.changes.change(rig.ownerId, rig.trip.id, { children: 3 }));
    expect(planNeedsReview(planNow(rig), moreChildren)).toBe(true);

    const back = savedTrip(await rig.changes.change(rig.ownerId, rig.trip.id, { children: 2 }));
    expect(planNeedsReview(planNow(rig), back)).toBe(false);
    const richer = savedTrip(await rig.changes.change(rig.ownerId, rig.trip.id, { budget: 6000 }));
    expect(planNeedsReview(planNow(rig), richer)).toBe(true);
  });

  // @covers REQ-TRV-098@v1
  test('is not noticed for a change that has nothing to do with the Plan', async () => {
    const rig = await aTripWithAPlan();

    const trip = savedTrip(await rig.changes.change(rig.ownerId, rig.trip.id, { name: 'A new name', travelStyles: ['Luxury'] }));

    expect(trip.name).toBe('A new name');
    expect(planNeedsReview(planNow(rig), trip)).toBe(false);
    expect(planNow(rig)).toEqual(rig.first);
  });

  // @covers REQ-TRV-098@v1
  test('is not noticed for a Plan saved before the travelers were recorded on it', () => {
    const trip = { adults: 9, children: 9, budget: 9 };

    expect(planNeedsReview({ }, trip)).toBe(false);
  });
});

describe('changing a Trip that has no Plan', () => {
  // @covers REQ-TRV-098@v1
  test('changes freely, with no warning and no AI, even to another Destination and other dates', async () => {
    const rig = await aTripWithAPlan();
    const created = rig.trips.create(rig.ownerId, aTripInput(rig.kyotoId, { name: 'Unplanned' }));
    if (!created.ok) throw new Error(created.error);

    const result = await rig.changes.change(rig.ownerId, created.trip.id, { destinationId: rig.osakaId, endDate: '2026-10-12' });

    expect(savedTrip(result)).toMatchObject({ destination: { name: 'Osaka' }, endDate: '2026-10-12' });
    expect(rig.ai.requests).toHaveLength(rig.asked);
  });

  test("is refused for another Traveler's Trip, as if the Trip were not there", async () => {
    const rig = await aTripWithAPlan();

    const result = await rig.changes.change(anOwner(rig.db), rig.trip.id, { name: 'Taken' }, { confirmPlanChange: true });

    expect(result).toEqual({ ok: false, error: 'not-found' });
    expect(tripNow(rig).name).toBe(rig.trip.name);
  });
});
