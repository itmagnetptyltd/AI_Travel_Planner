import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { requestTextOf } from '../../src/server/ai/ai-service';
import { accounts } from '../../src/server/db/schema';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';
import {
  aConfirmedTravelerSession,
  anAddedDestination,
  anAdministratorSession,
  aTripInput,
  createdTrip,
  listedTrips,
  TODAY,
} from '../support/a-trip';
import { aLoggedInTraveler } from '../support/a-traveler';
import { buildTestApp, type TestApp } from '../support/build-test-app';
import { generationsAlreadyMade } from '../support/an-ai-request';
import type { PlanView } from '../../src/shared/plan-schemas';

const TRAVELER_EMAIL = 'traveler@example.com';

interface Ready {
  readonly testApp: TestApp;
  readonly cookies: Record<string, string>;
  readonly tripId: string;
  readonly travelerId: string;
}

async function aTravelerWithATrip(tripOverrides: Parameters<typeof aTripInput>[1] = {}): Promise<Ready> {
  const testApp = await buildTestApp({ now: TODAY });
  const destinationId = await anAddedDestination(testApp, { name: 'Kyoto', country: 'Japan' });
  const cookies = await aConfirmedTravelerSession(testApp, TRAVELER_EMAIL);
  const trip = await createdTrip(testApp.app, cookies, aTripInput(destinationId, tripOverrides));
  const travelerId = testApp.db.select().from(accounts).where(eq(accounts.email, TRAVELER_EMAIL)).get()?.id ?? '';
  return { testApp, cookies, tripId: trip.id, travelerId };
}

function generate(ready: Ready, tripId = ready.tripId, cookies = ready.cookies) {
  return ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${tripId}/plan`, cookies });
}

describe('POST /api/trips/:id/plan', () => {
  // @covers REQ-TRV-026@v1
  test('returns 201 with a Plan of 8 Days for a Trip from 2026-10-10 to 2026-10-17', async () => {
    const ready = await aTravelerWithATrip();

    const response = await generate(ready);

    expect(response.statusCode).toBe(201);
    const plan = response.json() as PlanView;
    expect(plan.days).toHaveLength(8);
    expect(plan.days[0]?.date).toBe('2026-10-10');
    expect(plan.days[7]?.date).toBe('2026-10-17');
  });

  // @covers REQ-TRV-026@v1
  test('returns 429 with the reset time for the 21st generation of the day, and the AI is not called', async () => {
    const ready = await aTravelerWithATrip();
    generationsAlreadyMade(ready.testApp.db, ready.travelerId, 20, new Date(TODAY.getTime() - 60_000));

    const response = await generate(ready);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
      limit: 20,
      resetsAt: '2026-09-24T00:00:00.000Z',
      message: expect.stringContaining('2026-09-24 00:00 UTC'),
    });
    expect(ready.testApp.ai.requests).toHaveLength(0);
  });

  // @covers REQ-TRV-026@v1
  test('gives a Trip that is absent, deleted or someone else\'s the same 404', async () => {
    const ready = await aTravelerWithATrip();
    const other = await aLoggedInTraveler(ready.testApp.app, { email: 'other@example.com' });
    await ready.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies });

    const absent = await generate(ready, 'no-such-trip');
    const deleted = await generate(ready);
    const notOwned = await generate(ready, ready.tripId, other.cookies);

    expect([absent.statusCode, deleted.statusCode, notOwned.statusCode]).toEqual([404, 404, 404]);
    expect(deleted.json()).toEqual(absent.json());
    expect(ready.testApp.ai.requests).toHaveLength(0);
  });

  test('returns 401 to a caller who is not logged in, and the AI is not called', async () => {
    const ready = await aTravelerWithATrip();

    const response = await generate(ready, ready.tripId, {});

    expect(response.statusCode).toBe(401);
    expect(ready.testApp.ai.requests).toHaveLength(0);
  });

  // @covers REQ-TRV-027@v1
  test('gives every Activity a time, duration, cost, location, reason and category', async () => {
    const ready = await aTravelerWithATrip();

    const plan = (await generate(ready)).json() as PlanView;

    const activities = plan.days.flatMap((day) => day.activities);
    expect(activities.length).toBeGreaterThan(0);
    for (const activity of activities) {
      expect(activity.startTime).toMatch(/^\d\d:\d\d$/);
      expect(activity.durationMinutes).toBeGreaterThan(0);
      expect(activity.estimatedCost).toBeGreaterThanOrEqual(0);
      expect(activity.location).not.toBe('');
      expect(activity.reason).not.toBe('');
      expect(activity.category).not.toBe('');
    }
  });

  // @covers REQ-TRV-027@v1
  test('puts a restaurant dinner on Day 1 as a Food Activity and the hotel in the stay summary only', async () => {
    const ready = await aTravelerWithATrip();
    const days = Array.from({ length: 8 }, (_, index) => ({
      dayNumber: index + 1,
      activities: [
        anActivity({ title: 'Walk the Philosopher\'s Path', startTime: '10:00' }),
        ...(index === 0
          ? [anActivity({ title: 'Dinner at a kaiseki restaurant', startTime: '19:00', category: 'Food' as const })]
          : []),
      ],
    }));
    ready.testApp.ai.replyWith(
      aPlanReplyText({ days, stay: { accommodationType: 'Ryokan', suggestedArea: 'Higashiyama', nightlyCostEstimate: 220 } }),
    );

    const plan = (await generate(ready)).json() as PlanView;

    const dinner = plan.days[0]?.activities.find((a) => a.title === 'Dinner at a kaiseki restaurant');
    expect(dinner?.category).toBe('Food');
    expect(plan.stay).toEqual({ accommodationType: 'Ryokan', suggestedArea: 'Higashiyama', nightlyCostEstimate: 220 });
    const everyTitle = plan.days.flatMap((day) => day.activities.map((a) => a.title));
    expect(everyTitle.some((title) => /ryokan|hotel/i.test(title))).toBe(false);
  });

  // @covers REQ-TRV-029@v2
  test('returns 503 AI_UNAVAILABLE with a fallback message when the AI fails, and the Trip is unchanged', async () => {
    const ready = await aTravelerWithATrip();
    const before = await listedTrips(ready.testApp.app, ready.cookies);
    ready.testApp.ai.failWith();

    const response = await generate(ready);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'AI_UNAVAILABLE', message: expect.stringMatching(/unavailable/i) });
    expect(await listedTrips(ready.testApp.app, ready.cookies)).toEqual(before);
  });

  // @covers REQ-TRV-030@v2
  test('still lists Trips and opens a saved Trip while the AI does not answer, without calling it', async () => {
    const ready = await aTravelerWithATrip();
    ready.testApp.ai.neverAnswer();

    const list = await ready.testApp.app.inject({ method: 'GET', url: '/api/trips', cookies: ready.cookies });
    const one = await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies });

    expect(list.statusCode).toBe(200);
    expect((list.json() as { trips: { id: string }[] }).trips.map((t) => t.id)).toEqual([ready.tripId]);
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({ id: ready.tripId, name: 'Tokyo Family Holiday' });
    expect(ready.testApp.ai.requests).toHaveLength(0);
  });

  // @covers REQ-TRV-033@v2
  test('never sends the AI the account email address', async () => {
    const ready = await aTravelerWithATrip();

    const response = await generate(ready);

    expect(response.statusCode).toBe(201);
    expect(ready.testApp.ai.requests).toHaveLength(1);
    const [request] = ready.testApp.ai.requests;
    expect(requestTextOf(request ?? { system: '', user: '' })).not.toContain(TRAVELER_EMAIL);
  });
});

describe('the daily generation limit set by an Administrator', () => {
  // @covers REQ-TRV-091@v1
  test('refuses a sixth generation the same day, with the reset time, once the limit is set to 5', async () => {
    const ready = await aTravelerWithATrip();
    const adminCookies = await anAdministratorSession(ready.testApp);
    const set = await ready.testApp.app.inject({
      method: 'PUT',
      url: '/api/admin/ai-usage-limits',
      cookies: adminCookies,
      payload: { dailyPlanGenerationLimit: 5 },
    });
    expect(set.statusCode).toBe(200);
    for (let made = 0; made < 5; made += 1) {
      expect((await generate(ready)).statusCode).toBe(201);
    }

    const sixth = await generate(ready);

    expect(sixth.statusCode).toBe(429);
    expect(sixth.json()).toMatchObject({ code: 'PLAN_LIMIT_REACHED', limit: 5, resetsAt: '2026-09-24T00:00:00.000Z' });
  });

  // @covers REQ-TRV-091@v1
  test('reads back the limit an Administrator set, starting from 20', async () => {
    const { testApp } = await aTravelerWithATrip();
    const adminCookies = await anAdministratorSession(testApp);
    const read = () => testApp.app.inject({ method: 'GET', url: '/api/admin/ai-usage-limits', cookies: adminCookies });

    expect((await read()).json()).toEqual({ dailyPlanGenerationLimit: 20 });
    await testApp.app.inject({
      method: 'PUT',
      url: '/api/admin/ai-usage-limits',
      cookies: adminCookies,
      payload: { dailyPlanGenerationLimit: 5 },
    });

    expect((await read()).json()).toEqual({ dailyPlanGenerationLimit: 5 });
  });

  // @covers REQ-TRV-091@v1
  test.each([0, -1, 1.5, 1001, '5'])('refuses a limit of %s with 400 naming the field', async (limit) => {
    const { testApp } = await aTravelerWithATrip();
    const adminCookies = await anAdministratorSession(testApp);

    const response = await testApp.app.inject({
      method: 'PUT',
      url: '/api/admin/ai-usage-limits',
      cookies: adminCookies,
      payload: { dailyPlanGenerationLimit: limit },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED', field: 'dailyPlanGenerationLimit' });
  });
});
