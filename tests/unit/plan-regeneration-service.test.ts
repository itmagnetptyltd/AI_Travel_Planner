import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { requestTextOf } from '../../src/server/ai/ai-service';
import { aiRequests } from '../../src/server/db/schema';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { adjustToDates } from '../../src/server/plans/plan-edit';
import { createAiUsageLimitService } from '../../src/server/plans/ai-usage-limit-service';
import { createPlanEditorService } from '../../src/server/plans/plan-editor-service';
import { createPlanRegenerationService } from '../../src/server/plans/plan-regeneration-service';
import { createPlanService, type GenerateResult, type PlanGenerationSettings } from '../../src/server/plans/plan-service';
import { createPlanStore } from '../../src/server/plans/plan-store';
import { createTripService } from '../../src/server/trips/trip-service';
import type { SavedPlan } from '../../src/shared/plan-schemas';
import { aDestination } from '../support/a-destination';
import { aDayReplyText, anActivityReplyText } from '../support/a-plan-edits';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';
import { aTripInput, anOwner, TODAY } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock } from '../support/fixed-clock';
import { anAiDouble } from '../support/an-ai-double';
import { anAiRequestRecord, DAY, generationsAlreadyMade } from '../support/an-ai-request';

const SETTINGS: PlanGenerationSettings = {
  timeoutMs: 1_000,
  destinationTextMaxChars: 2_000,
  maxOutputTokens: 8_000,
  inputCostMicroUsdPerMTok: 3_000_000,
  outputCostMicroUsdPerMTok: 15_000_000,
};

const A_FRESH_DAY = aDayReplyText(4, [
  { title: 'Fresh breakfast', startTime: '08:30' },
  { title: 'Fresh gardens', startTime: '14:00' },
]);

/** An Owner with an 8-Day Trip from 2026-10-10 to Kyoto whose first Plan the AI double has already written. */
async function aPlannedTrip(tripOverrides: Parameters<typeof aTripInput>[1] = {}) {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const ai = anAiDouble();
  const trips = createTripService({ db, clock });
  const limits = createAiUsageLimitService({ db, clock });
  const destinations = createDestinationService({ db, clock });
  const store = createPlanStore({ db, clock });
  const deps = { db, clock, ai, trips, limits, store, settings: SETTINGS };
  const plans = createPlanService(deps);
  const regeneration = createPlanRegenerationService(deps);
  const editor = createPlanEditorService({ trips, store });
  const ownerId = anOwner(db);
  const kyotoId = destinations.add(aDestination()).id;
  const created = trips.create(ownerId, aTripInput(kyotoId, tripOverrides));
  if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
  const trip = created.trip;
  const first = await plans.generate(ownerId, trip.id);
  if (!first.ok) throw new Error(`The first Plan failed: ${first.error}`);
  const askedSoFar = ai.requests.length;
  return { db, clock, ai, trips, destinations, store, plans, regeneration, editor, ownerId, kyotoId, trip, first: first.plan, askedSoFar };
}

type Rig = Awaited<ReturnType<typeof aPlannedTrip>>;

const savedPlanOf = (result: GenerateResult): SavedPlan => {
  if (!result.ok) throw new Error(`Expected a Plan, got ${result.error}`);
  return result.plan;
};

const aHandEditOnDay = (rig: Rig, dayNumber: number, index = 0) => {
  const activity = rig.first.days.find((day) => day.dayNumber === dayNumber)?.activities[index];
  if (!activity) throw new Error(`No Activity at day ${dayNumber} position ${index}`);
  const edited = rig.editor.editActivity(rig.ownerId, rig.trip.id, activity.id, { startTime: '11:11' });
  if (!edited.ok) throw new Error(edited.error);
  return { activity, plan: edited.plan };
};

const titlesOf = (plan: SavedPlan, dayNumber: number) => plan.days.find((day) => day.dayNumber === dayNumber)?.activities.map((a) => a.title);

describe('regenerating the whole Plan', () => {
  // @covers REQ-TRV-041@v1
  test('shows the Plan the AI answers with, and keeps the earlier Plan as a version that can be restored', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(aPlanReplyText({ days: Array.from({ length: 8 }, (_, i) => ({ dayNumber: i + 1, activities: [anActivity({ title: 'Brand new idea' })] })) }));

    const second = savedPlanOf(await rig.plans.generate(rig.ownerId, rig.trip.id));

    expect(second.version).toBe(2);
    expect(titlesOf(second, 1)).toEqual(['Brand new idea']);
    expect(rig.store.listVersions(rig.trip.id).map((v) => v.version)).toEqual([2, 1]);
    rig.store.restore(rig.trip.id, 1);
    expect(rig.store.current(rig.trip.id)?.days).toEqual(rig.first.days);
  });

  // @covers REQ-TRV-041@v1
  test('warns, before any request is sent, that hand-changed Activities would be replaced', async () => {
    const rig = await aPlannedTrip();
    aHandEditOnDay(rig, 3);

    const result = await rig.plans.generate(rig.ownerId, rig.trip.id);

    expect(result).toEqual({ ok: false, error: 'edits-would-be-replaced', days: [3] });
    expect(rig.ai.requests).toHaveLength(rig.askedSoFar);
    expect(rig.db.select().from(aiRequests).all()).toHaveLength(1);
  });

  // @covers REQ-TRV-041@v1
  test('once confirmed, shows the AI Plan, and the hand-changed Activity is not in it', async () => {
    const rig = await aPlannedTrip();
    const { activity } = aHandEditOnDay(rig, 3);

    const confirmed = savedPlanOf(await rig.plans.generate(rig.ownerId, rig.trip.id, { confirmReplaceEdits: true }));

    expect(confirmed.days.flatMap((day) => day.activities).some((a) => a.id === activity.id || a.changedByHand)).toBe(false);
    expect(rig.ai.requests).toHaveLength(rig.askedSoFar + 1);
  });

  // @covers REQ-TRV-041@v1
  test('needs no confirmation when the Traveler has changed nothing by hand', async () => {
    const rig = await aPlannedTrip();

    const result = await rig.plans.generate(rig.ownerId, rig.trip.id);

    expect(result.ok).toBe(true);
  });

  // @covers REQ-TRV-041@v1
  test('is refused at 20 generations today, with the reset time, and the Plan is unchanged', async () => {
    const rig = await aPlannedTrip();
    generationsAlreadyMade(rig.db, rig.ownerId, 19, new Date(TODAY.getTime() - 60_000));

    const result = await rig.plans.generate(rig.ownerId, rig.trip.id);

    expect(result).toMatchObject({ ok: false, error: 'limit-reached', limit: 20, resetsAt: new Date('2026-09-24T00:00:00Z') });
    expect(rig.ai.requests).toHaveLength(rig.askedSoFar);
    expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
    expect(rig.store.listVersions(rig.trip.id)).toHaveLength(1);
  });

  // @covers REQ-TRV-102@v1
  test('keeps the saved Plan as the current one when the AI fails', async () => {
    const rig = await aPlannedTrip();
    rig.ai.failWith();

    const result = await rig.plans.generate(rig.ownerId, rig.trip.id);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
    expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
    expect(rig.store.listVersions(rig.trip.id)).toHaveLength(1);
  });

  // @covers REQ-TRV-043@v1
  test('sends the Trip current preferences, and leaves the Trip preferences as they were', async () => {
    const rig = await aPlannedTrip({ travelStyles: ['Adventure'], interests: ['Nature'] });
    const before = rig.trips.getForOwner(rig.ownerId, rig.trip.id);

    await rig.plans.generate(rig.ownerId, rig.trip.id);

    const text = requestTextOf(rig.ai.requests.at(-1) ?? { system: '', user: '' });
    expect(text).toContain('Travel style: Adventure');
    expect(text).toContain('Interests: Nature');
    expect(rig.trips.getForOwner(rig.ownerId, rig.trip.id)).toEqual(before);
    expect(before).toMatchObject({ travelStyles: ['Adventure'], interests: ['Nature'] });
  });

  // @covers REQ-TRV-094@v1
  test('regenerates the Plan of a Trip whose Destination was disabled, and the Trip still has that Destination', async () => {
    const rig = await aPlannedTrip();
    rig.destinations.setDisabled(rig.kyotoId, true);

    const result = await rig.plans.generate(rig.ownerId, rig.trip.id);

    expect(result.ok).toBe(true);
    expect(requestTextOf(rig.ai.requests.at(-1) ?? { system: '', user: '' })).toContain('Kyoto');
    expect(rig.trips.getForOwner(rig.ownerId, rig.trip.id)?.destination).toMatchObject({ id: rig.kyotoId, name: 'Kyoto' });
  });
});

describe('regenerating one Day', () => {
  // @covers REQ-TRV-042@v1
  test('replaces Day 4 with the Activities the AI wrote, and leaves the other 7 Days exactly as they were', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(A_FRESH_DAY);

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    if (!result.ok) throw new Error(result.error);
    expect(titlesOf(result.plan, 4)).toEqual(['Fresh breakfast', 'Fresh gardens']);
    expect(result.plan.days.filter((day) => day.dayNumber !== 4)).toEqual(rig.first.days.filter((day) => day.dayNumber !== 4));
    expect(result.plan.days[3]).toMatchObject({ dayNumber: 4, date: '2026-10-13' });
  });

  // @covers REQ-TRV-042@v1
  test('saves the new Plan as a version and keeps the earlier one, which can be restored', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(A_FRESH_DAY);

    await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(rig.store.listVersions(rig.trip.id).map((v) => [v.version, v.source])).toEqual([[2, 'day-regeneration'], [1, 'generation']]);
    rig.store.restore(rig.trip.id, 1);
    expect(rig.store.current(rig.trip.id)?.days).toEqual(rig.first.days);
  });

  // @covers REQ-TRV-042@v1
  test('asks the AI for that Day only: it names Day 4 and 2026-10-13, and is not the whole-Plan request', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(A_FRESH_DAY);

    await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    const sent = rig.ai.requests.at(-1);
    expect(sent?.user).toContain('Day 4');
    expect(sent?.user).toContain('2026-10-13');
    expect(sent?.system).not.toContain('"days"');
  });

  // @covers REQ-TRV-042@v1
  test('warns, before any request is sent, when Day 4 holds a hand-changed Activity', async () => {
    const rig = await aPlannedTrip();
    aHandEditOnDay(rig, 4);

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(result).toEqual({ ok: false, error: 'edits-would-be-replaced', days: [4] });
    expect(rig.ai.requests).toHaveLength(rig.askedSoFar);
  });

  // @covers REQ-TRV-042@v1
  test('replaces Day 4 hand edits once confirmed, and leaves Day 5 hand edits alone', async () => {
    const rig = await aPlannedTrip();
    aHandEditOnDay(rig, 4);
    const { activity: onDay5 } = aHandEditOnDay(rig, 5);
    rig.ai.replyWith(A_FRESH_DAY);

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4, { confirmReplaceEdits: true });

    if (!result.ok) throw new Error(result.error);
    expect(titlesOf(result.plan, 4)).toEqual(['Fresh breakfast', 'Fresh gardens']);
    const dayFive = result.plan.days.find((day) => day.dayNumber === 5)?.activities ?? [];
    expect(dayFive.find((a) => a.id === onDay5.id)).toMatchObject({ startTime: '11:11', changedByHand: true });
  });

  // @covers REQ-TRV-042@v1
  test('does not warn about hand edits on some other Day', async () => {
    const rig = await aPlannedTrip();
    aHandEditOnDay(rig, 5);
    rig.ai.replyWith(A_FRESH_DAY);

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(result.ok).toBe(true);
  });

  // @covers REQ-TRV-042@v1
  test('generates a Day that is empty because the Trip grew, with no warning', async () => {
    const rig = await aPlannedTrip();
    const grown = adjustToDates(rig.first, '2026-10-10', 10);
    rig.store.save(rig.trip.id, grown, 'trip-change');
    rig.trips.update(rig.ownerId, rig.trip.id, { endDate: '2026-10-19' });
    rig.ai.replyWith(aDayReplyText(9, [{ title: 'Day nine walk', startTime: '10:00' }]));

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 9);

    if (!result.ok) throw new Error(result.error);
    expect(titlesOf(result.plan, 9)).toEqual(['Day nine walk']);
    expect(result.plan.days).toHaveLength(10);
  });

  // @covers REQ-TRV-042@v1
  test.each([
    ['a Day the Plan does not have', 12, { ok: false, error: 'day-not-found' }],
    ['Day 0', 0, { ok: false, error: 'day-not-found' }],
  ])('is refused for %s, and the AI is not asked', async (_name, dayNumber, expected) => {
    const rig = await aPlannedTrip();

    expect(await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, dayNumber)).toEqual(expected);
    expect(rig.ai.requests).toHaveLength(rig.askedSoFar);
  });

  // @covers REQ-TRV-042@v1
  test.each([
    ['an answer for a different Day', aDayReplyText(5, [{}])],
    ['an answer with no Activity', aDayReplyText(4, [])],
    ['text that is not JSON', 'I would love to help with that!'],
  ])('keeps the Plan as it was when the AI gives %s', async (_name, reply) => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(reply);

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
    expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
    expect(rig.db.select().from(aiRequests).where(eq(aiRequests.kind, 'day-regeneration')).get()?.status).toBe('failed');
  });

  // @covers REQ-TRV-102@v1
  test('keeps the saved Plan as the current one when the AI fails, times out, or throws before it answers', async () => {
    const rig = await aPlannedTrip();
    for (const arrange of [() => rig.ai.failWith(), () => rig.ai.neverAnswer(), () => rig.ai.throwSynchronously(new Error('boom'))]) {
      arrange();
      const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4).catch(() => null);
      expect(result === null || (!result.ok && result.error === 'ai-unavailable')).toBe(true);
      expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
    }
  });

  // @covers REQ-TRV-043@v1
  test('sends the Trip current preferences and leaves the Trip preferences as they were', async () => {
    const rig = await aPlannedTrip({ travelStyles: ['Adventure'], interests: ['Nature'] });
    rig.ai.replyWith(A_FRESH_DAY);
    const before = rig.trips.getForOwner(rig.ownerId, rig.trip.id);

    await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    const text = requestTextOf(rig.ai.requests.at(-1) ?? { system: '', user: '' });
    expect(text).toContain('Travel style: Adventure');
    expect(text).toContain('Interests: Nature');
    expect(rig.trips.getForOwner(rig.ownerId, rig.trip.id)).toEqual(before);
  });

  // @covers REQ-TRV-094@v1
  test('regenerates a Day of a Trip whose Destination was disabled, and the Trip still has that Destination', async () => {
    const rig = await aPlannedTrip();
    rig.destinations.setDisabled(rig.kyotoId, true);
    rig.ai.replyWith(A_FRESH_DAY);

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(result.ok).toBe(true);
    expect(requestTextOf(rig.ai.requests.at(-1) ?? { system: '', user: '' })).toContain('Kyoto');
    expect(rig.trips.getForOwner(rig.ownerId, rig.trip.id)?.destination.name).toBe('Kyoto');
  });

  // @covers REQ-TRV-041@v1
  test('records the request as a day-regeneration, and counts it toward the same daily limit as a whole Plan', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(A_FRESH_DAY);
    generationsAlreadyMade(rig.db, rig.ownerId, 18, new Date(TODAY.getTime() - 60_000));

    const allowed = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);
    const refused = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(allowed.ok).toBe(true);
    expect(refused).toMatchObject({ ok: false, error: 'limit-reached', limit: 20 });
    expect(rig.db.select().from(aiRequests).where(eq(aiRequests.kind, 'day-regeneration')).all()).toHaveLength(1);
  });

  // @covers REQ-TRV-041@v1
  test('is refused at the daily limit with the reset time, when the earlier requests were other kinds', async () => {
    const rig = await aPlannedTrip();
    for (let made = 0; made < 19; made += 1) {
      anAiRequestRecord(rig.db, { accountId: rig.ownerId, kind: 'activity-suggestion', createdAt: new Date(TODAY.getTime() - 60_000) });
    }

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(result).toMatchObject({ ok: false, error: 'limit-reached', limit: 20, resetsAt: new Date('2026-09-24T00:00:00Z') });
    expect(rig.ai.requests).toHaveLength(rig.askedSoFar);
  });

  // @covers REQ-TRV-042@v1
  test('does not count requests from yesterday', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(A_FRESH_DAY);
    generationsAlreadyMade(rig.db, rig.ownerId, 30, new Date(TODAY.getTime() - DAY));

    expect((await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4)).ok).toBe(true);
  });

  // @covers REQ-TRV-042@v1
  test('saves nothing, and says the Trip changed, when its dates are edited while the AI is answering', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(() => {
      rig.trips.update(rig.ownerId, rig.trip.id, { endDate: '2026-10-16' });
      return A_FRESH_DAY;
    });

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(result).toEqual({ ok: false, error: 'trip-changed' });
    expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
  });

  // @covers REQ-TRV-042@v1
  test('applies to the Plan as it is when the AI answers, not as it was when the Day was asked for', async () => {
    const rig = await aPlannedTrip();
    const onDay6 = rig.first.days[5]?.activities[0];
    rig.ai.replyWith(() => {
      rig.editor.removeActivity(rig.ownerId, rig.trip.id, onDay6?.id ?? '');
      return A_FRESH_DAY;
    });

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    if (!result.ok) throw new Error(result.error);
    expect(result.plan.days[5]?.activities.some((a) => a.id === onDay6?.id)).toBe(false);
    expect(titlesOf(result.plan, 4)).toEqual(['Fresh breakfast', 'Fresh gardens']);
  });

  test("is refused for another Traveler's Trip, and for a Trip with no Plan, without asking the AI", async () => {
    const rig = await aPlannedTrip();
    const other = createPlanRegenerationService({
      db: rig.db, clock: rig.clock, ai: rig.ai, trips: rig.trips, store: rig.store, settings: SETTINGS,
      limits: createAiUsageLimitService({ db: rig.db, clock: rig.clock }),
    });
    const created = rig.trips.create(rig.ownerId, aTripInput(rig.kyotoId, { name: 'No plan yet' }));
    if (!created.ok) throw new Error(created.error);

    expect(await other.regenerateDay(anOwner(rig.db), rig.trip.id, 4)).toEqual({ ok: false, error: 'not-found' });
    expect(await other.regenerateDay(rig.ownerId, created.trip.id, 1)).toEqual({ ok: false, error: 'no-plan' });
    expect(rig.ai.requests).toHaveLength(rig.askedSoFar);
  });
});

describe('asking the AI for a replacement Activity', () => {
  const firstActivityId = (rig: Rig) => rig.first.days[1]?.activities[1]?.id ?? '';

  // @covers REQ-TRV-047@v1
  test('gives the Activity the AI suggests, and saves nothing until the Traveler accepts it', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(anActivityReplyText({ title: 'Tea ceremony', startTime: '12:30', estimatedCost: 30 }));

    const result = await rig.regeneration.suggestReplacement(rig.ownerId, rig.trip.id, firstActivityId(rig));

    if (!result.ok) throw new Error(result.error);
    expect(result.activity).toMatchObject({ title: 'Tea ceremony', startTime: '12:30', estimatedCost: 30 });
    expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
    expect(rig.store.listVersions(rig.trip.id)).toHaveLength(1);
  });

  // @covers REQ-TRV-047@v1
  test('asks about the Day and the Activity being replaced, and records the request as an activity-suggestion', async () => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(anActivityReplyText());

    await rig.regeneration.suggestReplacement(rig.ownerId, rig.trip.id, firstActivityId(rig));

    const sent = rig.ai.requests.at(-1);
    expect(sent?.user).toContain('Day 2');
    expect(sent?.user).toContain('2026-10-11');
    expect(sent?.user).toContain('Lunch at a ramen counter');
    expect(rig.db.select().from(aiRequests).where(eq(aiRequests.kind, 'activity-suggestion')).all()).toHaveLength(1);
  });

  // @covers REQ-TRV-047@v1
  test('is refused at 20 generations today, with the reset time, and the AI is not asked', async () => {
    const rig = await aPlannedTrip();
    generationsAlreadyMade(rig.db, rig.ownerId, 19, new Date(TODAY.getTime() - 60_000));

    const result = await rig.regeneration.suggestReplacement(rig.ownerId, rig.trip.id, firstActivityId(rig));

    expect(result).toMatchObject({ ok: false, error: 'limit-reached', limit: 20, resetsAt: new Date('2026-09-24T00:00:00Z') });
    expect(rig.ai.requests).toHaveLength(rig.askedSoFar);
  });

  // @covers REQ-TRV-047@v1
  test('is refused for an Activity that is not in the Plan, without reserving a request', async () => {
    const rig = await aPlannedTrip();

    expect(await rig.regeneration.suggestReplacement(rig.ownerId, rig.trip.id, 'nope')).toEqual({ ok: false, error: 'activity-not-found' });
    expect(rig.db.select().from(aiRequests).all()).toHaveLength(1);
  });

  // @covers REQ-TRV-047@v1
  test.each([
    ['an answer that is not an Activity', JSON.stringify({ activity: { title: 'x' } })],
    ['text that is not JSON', 'Here is an idea!'],
  ])('reports the AI as unavailable, and changes nothing, when it gives %s', async (_name, reply) => {
    const rig = await aPlannedTrip();
    rig.ai.replyWith(reply);

    const result = await rig.regeneration.suggestReplacement(rig.ownerId, rig.trip.id, firstActivityId(rig));

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
    expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
  });

  // @covers REQ-TRV-047@v1
  test('reports the AI as unavailable when it fails', async () => {
    const rig = await aPlannedTrip();
    rig.ai.failWith();

    expect(await rig.regeneration.suggestReplacement(rig.ownerId, rig.trip.id, firstActivityId(rig))).toMatchObject({
      ok: false,
      error: 'ai-unavailable',
    });
  });
});

describe('changes made while the AI is answering', () => {
  const anotherDestination = (rig: Rig) => rig.destinations.add(aDestination({ name: 'Osaka' })).id;

  // @covers REQ-TRV-041@v1
  test('saves no Plan, and says the Trip changed, when its Destination is changed while a whole Plan is being written', async () => {
    const rig = await aPlannedTrip();
    const osakaId = anotherDestination(rig);
    rig.ai.replyWith(() => {
      rig.trips.update(rig.ownerId, rig.trip.id, { destinationId: osakaId });
      return aPlanReplyText({ dayCount: 8 });
    });

    const result = await rig.plans.generate(rig.ownerId, rig.trip.id);

    expect(result).toEqual({ ok: false, error: 'trip-changed' });
    expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
  });

  // @covers REQ-TRV-042@v1
  test('saves no Day, and says the Trip changed, when its Destination is changed while a Day is being written', async () => {
    const rig = await aPlannedTrip();
    const osakaId = anotherDestination(rig);
    rig.ai.replyWith(() => {
      rig.trips.update(rig.ownerId, rig.trip.id, { destinationId: osakaId });
      return A_FRESH_DAY;
    });

    const result = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(result).toEqual({ ok: false, error: 'trip-changed' });
    expect(rig.store.current(rig.trip.id)).toEqual(rig.first);
  });

  // @covers REQ-TRV-041@v1
  test('keeps an Activity the Traveler changed while the whole Plan was being written, unless they have agreed to lose it', async () => {
    const rig = await aPlannedTrip();
    const activityId = rig.first.days[2]?.activities[0]?.id ?? '';
    rig.ai.replyWith(() => {
      rig.editor.editActivity(rig.ownerId, rig.trip.id, activityId, { startTime: '11:11' });
      return aPlanReplyText({ dayCount: 8 });
    });

    const result = await rig.plans.generate(rig.ownerId, rig.trip.id);

    expect(result).toEqual({ ok: false, error: 'edits-would-be-replaced', days: [3] });
    expect(rig.store.current(rig.trip.id)?.days[2]?.activities.find((a) => a.id === activityId)).toMatchObject({ startTime: '11:11' });
    expect(rig.store.listVersions(rig.trip.id).map((v) => v.source)).toEqual(['edit', 'generation']);
  });

  // @covers REQ-TRV-041@v1
  test('replaces an Activity changed while the Plan was being written when the Traveler had already agreed to lose their changes', async () => {
    const rig = await aPlannedTrip();
    const activityId = rig.first.days[2]?.activities[0]?.id ?? '';
    rig.ai.replyWith(() => {
      rig.editor.editActivity(rig.ownerId, rig.trip.id, activityId, { startTime: '11:11' });
      return aPlanReplyText({ dayCount: 8 });
    });

    const result = await rig.plans.generate(rig.ownerId, rig.trip.id, { confirmReplaceEdits: true });

    expect(result.ok).toBe(true);
  });

  // @covers REQ-TRV-042@v1
  test('keeps an Activity the Traveler changed on that Day while it was being written, but not a change on another Day', async () => {
    const rig = await aPlannedTrip();
    const onDay6 = rig.first.days[5]?.activities[0]?.id ?? '';
    rig.ai.replyWith(() => {
      rig.editor.editActivity(rig.ownerId, rig.trip.id, onDay6, { startTime: '11:11' });
      return A_FRESH_DAY;
    });
    expect((await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4)).ok).toBe(true);

    const onDay4 = rig.store.current(rig.trip.id)?.days[3]?.activities[0]?.id ?? '';
    rig.ai.replyWith(() => {
      rig.editor.editActivity(rig.ownerId, rig.trip.id, onDay4, { startTime: '11:12' });
      return A_FRESH_DAY;
    });
    const refused = await rig.regeneration.regenerateDay(rig.ownerId, rig.trip.id, 4);

    expect(refused).toMatchObject({ ok: false, error: 'edits-would-be-replaced' });
  });
});
