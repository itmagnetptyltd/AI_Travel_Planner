import { describe, expect, test } from 'vitest';
import { requestTextOf } from '../../src/server/ai/ai-service';
import { planNeedsReview } from '../../src/shared/plan-basis';
import type { SavedPlan } from '../../src/shared/plan-schemas';
import type { TripView } from '../../src/shared/trip-schemas';
import { aTravelerWithAPlan, planOf } from '../support/a-plan-edits';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';
import { accountIdOfTraveler, aTravelerWithATrip, versionsOf } from '../support/a-saved-plan-journey';
import { aConfirmedTravelerSession, anAddedDestination, TODAY } from '../support/a-trip';
import { generationsAlreadyMade } from '../support/an-ai-request';

type Ready = Awaited<ReturnType<typeof aTravelerWithAPlan>>;

const patchTrip = (ready: Pick<Ready, 'testApp' | 'cookies' | 'tripId'>, payload: object, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'PATCH', url: `/api/trips/${ready.tripId}`, cookies, payload });

const tripOf = async (ready: Pick<Ready, 'testApp' | 'cookies' | 'tripId'>): Promise<TripView> =>
  (await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies })).json() as TripView;

/** The Trip form sends every field on every save, so a change is always sent with the values that did not change. */
const withTheRestUnchanged = (trip: TripView, change: object) => ({
  name: trip.name,
  destinationId: trip.destination.id,
  startDate: trip.startDate,
  endDate: trip.endDate,
  adults: trip.adults,
  children: trip.children,
  budget: trip.budget,
  currency: trip.currency,
  ...change,
});

describe('PATCH /api/trips/:id on a Trip that has a Plan: the Destination', () => {
  // @covers REQ-TRV-098@v1
  test('answers 409 PLAN_CHANGE_NEEDS_CONFIRMATION, and the Trip and its Plan are unchanged, until the owner confirms', async () => {
    const ready = await aTravelerWithAPlan();
    const osakaId = await anAddedDestination(ready.testApp, { name: 'Osaka' });
    const before = await tripOf(ready);

    const response = await patchTrip(ready, withTheRestUnchanged(before, { destinationId: osakaId }));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PLAN_CHANGE_NEEDS_CONFIRMATION', effect: { kind: 'regenerate' } });
    expect(await tripOf(ready)).toEqual(before);
    expect(await planOf(ready)).toEqual(ready.plan);
  });

  // @covers REQ-TRV-098@v1
  test('sends the AI a request for Osaka once confirmed, and the Trip shows the Plan it returned', async () => {
    const ready = await aTravelerWithAPlan();
    const osakaId = await anAddedDestination(ready.testApp, { name: 'Osaka' });
    ready.testApp.ai.replyWith(aPlanReplyText({ days: Array.from({ length: 8 }, (_, i) => ({ dayNumber: i + 1, activities: [anActivity({ title: 'Osaka castle walk' })] })) }));

    const response = await patchTrip(ready, { ...withTheRestUnchanged(await tripOf(ready), { destinationId: osakaId }), confirmPlanChange: true });

    expect(response.statusCode).toBe(200);
    expect((response.json() as TripView).destination.name).toBe('Osaka');
    expect(requestTextOf(ready.testApp.ai.requests.at(-1) ?? { system: '', user: '' })).toContain('Destination: Osaka, Japan');
    expect((await planOf(ready)).days[0]?.activities[0]?.title).toBe('Osaka castle walk');
    expect((await versionsOf(ready)).map((v) => [v.version, v.source])).toEqual([[2, 'trip-change'], [1, 'generation']]);
  });

  // @covers REQ-TRV-098@v1
  test('answers 503 when the AI fails, and the Trip is still on its old Destination with its old Plan', async () => {
    const ready = await aTravelerWithAPlan();
    const osakaId = await anAddedDestination(ready.testApp, { name: 'Osaka' });
    const before = await tripOf(ready);
    ready.testApp.ai.failWith();

    const response = await patchTrip(ready, { ...withTheRestUnchanged(before, { destinationId: osakaId }), confirmPlanChange: true });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(await tripOf(ready)).toEqual(before);
    expect(await planOf(ready)).toEqual(ready.plan);
  });

  // @covers REQ-TRV-098@v1
  test('answers 429 at the daily limit, and the Trip is unchanged', async () => {
    const ready = await aTravelerWithAPlan();
    const osakaId = await anAddedDestination(ready.testApp, { name: 'Osaka' });
    const before = await tripOf(ready);
    generationsAlreadyMade(ready.testApp.db, accountIdOfTraveler(ready.testApp), 19, new Date(TODAY.getTime() - 60_000));

    const response = await patchTrip(ready, { ...withTheRestUnchanged(before, { destinationId: osakaId }), confirmPlanChange: true });

    expect(response.statusCode).toBe(429);
    expect(await tripOf(ready)).toEqual(before);
  });

  // @covers REQ-TRV-098@v1
  test('answers 400 naming the field when the confirmation is not true or false', async () => {
    const ready = await aTravelerWithAPlan();

    const response = await patchTrip(ready, { name: 'x', confirmPlanChange: 'yes' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'confirmPlanChange' });
  });
});

describe('PATCH /api/trips/:id on a Trip that has a Plan: the dates', () => {
  // @covers REQ-TRV-098@v1
  test('answers 409 naming Days 6 to 8 when an 8-Day Trip is shortened to 5, before anything is saved', async () => {
    const ready = await aTravelerWithAPlan();
    const before = await tripOf(ready);

    const response = await patchTrip(ready, withTheRestUnchanged(before, { endDate: '2026-10-14' }));

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PLAN_CHANGE_NEEDS_CONFIRMATION', effect: { kind: 'drop-days', droppedDays: [6, 7, 8] } });
    expect(await tripOf(ready)).toEqual(before);
    expect(await planOf(ready)).toEqual(ready.plan);
  });

  // @covers REQ-TRV-098@v1
  test('leaves a Plan of 5 Days with the same Activities as the former Days 1 to 5 once confirmed', async () => {
    const ready = await aTravelerWithAPlan();

    const response = await patchTrip(ready, { ...withTheRestUnchanged(await tripOf(ready), { endDate: '2026-10-14' }), confirmPlanChange: true });

    expect(response.statusCode).toBe(200);
    expect((await planOf(ready)).days).toEqual(ready.plan.days.slice(0, 5));
    expect((await tripOf(ready)).dayCount).toBe(5);
  });

  // @covers REQ-TRV-098@v1
  test('adds Days 9 and 10 empty when the Trip grows to 10 Days, with no warning, and keeps Days 1 to 8', async () => {
    const ready = await aTravelerWithAPlan();

    const response = await patchTrip(ready, withTheRestUnchanged(await tripOf(ready), { endDate: '2026-10-19' }));

    expect(response.statusCode).toBe(200);
    const plan = await planOf(ready);
    expect(plan.days.slice(0, 8)).toEqual(ready.plan.days);
    expect(plan.days.slice(8).map((day) => [day.dayNumber, day.date, day.activities.length])).toEqual([[9, '2026-10-18', 0], [10, '2026-10-19', 0]]);
  });

  // @covers REQ-TRV-098@v1
  test('dates Day 1 as 2026-10-12, with the former Day 1 Activities, when the Trip moves two days later', async () => {
    const ready = await aTravelerWithAPlan();

    const response = await patchTrip(ready, withTheRestUnchanged(await tripOf(ready), { startDate: '2026-10-12', endDate: '2026-10-19' }));

    expect(response.statusCode).toBe(200);
    const plan = await planOf(ready);
    expect(plan.days[0]).toMatchObject({ dayNumber: 1, date: '2026-10-12' });
    expect(plan.days[7]?.date).toBe('2026-10-19');
    expect(plan.days.map((day) => day.activities)).toEqual(ready.plan.days.map((day) => day.activities));
  });
});

describe('PATCH /api/trips/:id on a Trip that has a Plan: the travelers and the budget', () => {
  // @covers REQ-TRV-098@v1
  test('leaves the Plan exactly as it was, and the Trip differs from what the Plan was made for', async () => {
    const ready = await aTravelerWithAPlan();

    const response = await patchTrip(ready, withTheRestUnchanged(await tripOf(ready), { adults: 4, budget: 9000 }));

    expect(response.statusCode).toBe(200);
    const plan: SavedPlan = await planOf(ready);
    expect(plan).toEqual(ready.plan);
    expect(planNeedsReview(plan, await tripOf(ready))).toBe(true);
    expect(await versionsOf(ready)).toHaveLength(1);
  });

  // @covers REQ-TRV-098@v1
  test('needs no confirmation for a change of name or preferences, and the Plan is not flagged', async () => {
    const ready = await aTravelerWithAPlan();

    const response = await patchTrip(ready, { name: 'Renamed', travelStyles: ['Luxury'] });

    expect(response.statusCode).toBe(200);
    expect(planNeedsReview(await planOf(ready), await tripOf(ready))).toBe(false);
  });
});

describe('PATCH /api/trips/:id on a Trip that has no Plan', () => {
  // @covers REQ-TRV-098@v1
  test('changes the Destination and the dates freely, with no warning', async () => {
    const ready = await aTravelerWithATrip();
    const osakaId = await anAddedDestination(ready.testApp, { name: 'Osaka' });

    const response = await patchTrip(ready, { destinationId: osakaId, endDate: '2026-10-12' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ destination: { name: 'Osaka' }, endDate: '2026-10-12' });
    expect(ready.testApp.ai.requests).toHaveLength(0);
  });
});

describe('who may change a Trip that has a Plan', () => {
  test('answers 404 to another Traveler, and the Trip and its Plan are unchanged', async () => {
    const ready = await aTravelerWithAPlan();
    const other = await aConfirmedTravelerSession(ready.testApp, 'other@example.com');

    const response = await patchTrip(ready, { name: 'Taken over', endDate: '2026-10-12', confirmPlanChange: true }, other);

    expect(response.statusCode).toBe(404);
    expect(await planOf(ready)).toEqual(ready.plan);
  });
});
