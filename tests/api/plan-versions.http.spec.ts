import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, test } from 'vitest';
import { trips } from '../../src/server/db/schema';
import type { PlanVersionSummary, SavedPlan } from '../../src/shared/plan-schemas';
import type { TripView } from '../../src/shared/trip-schemas';
import { aLoggedInTraveler, logIn, sessionCookieFrom } from '../support/a-traveler';
import { aPlanReplyText } from '../support/a-plan-reply';
import { listedTrips, TODAY } from '../support/a-trip';
import { buildTestApp } from '../support/build-test-app';
import {
  aTravelerWithATrip,
  currentPlan,
  firstActivityTitle,
  generatePlan,
  restoreVersion,
  theAiWillSuggest,
  versionsOf,
} from '../support/a-saved-plan-journey';

describe('a generated Plan is saved with its Trip', () => {
  // @covers REQ-TRV-017@v1
  test('lists the Trip as Planned and returns the Plan when the Trip is reopened', async () => {
    const ready = await aTravelerWithATrip();
    expect((await listedTrips(ready.testApp.app, ready.cookies))[0]?.status).toBe('Draft');

    const generated = await generatePlan(ready);

    expect(generated.statusCode).toBe(201);
    expect((await listedTrips(ready.testApp.app, ready.cookies))[0]?.status).toBe('Planned');
    const reopened = await currentPlan(ready);
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toEqual(generated.json());
  });

  // @covers REQ-TRV-017@v1
  test('gives a Trip with one generated Plan a version list of exactly one version', async () => {
    const ready = await aTravelerWithATrip();

    await generatePlan(ready);

    expect(await versionsOf(ready)).toEqual([
      { version: 1, createdAt: expect.any(String), source: 'generation' },
    ]);
  });

  // @covers REQ-TRV-017@v1
  test('answers 404 PLAN_NOT_FOUND for a Trip that has no Plan yet, and leaves it Draft', async () => {
    const ready = await aTravelerWithATrip();

    const response = await currentPlan(ready);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'PLAN_NOT_FOUND' });
    expect(await versionsOf(ready)).toEqual([]);
  });

  // @covers REQ-TRV-017@v1
  test('saves nothing, and leaves the Trip Draft, when the AI fails', async () => {
    const ready = await aTravelerWithATrip();
    ready.testApp.ai.failWith();

    const response = await generatePlan(ready);

    expect(response.statusCode).toBe(503);
    expect((await listedTrips(ready.testApp.app, ready.cookies))[0]?.status).toBe('Draft');
    expect((await currentPlan(ready)).statusCode).toBe(404);
  });
});

describe('reopening a saved Trip', () => {
  // @covers REQ-TRV-018@v1
  test('shows the same 8 Days and Activities after the Traveler logs out, logs in and opens the Trip', async () => {
    const ready = await aTravelerWithATrip();
    const generated = (await generatePlan(ready)).json() as SavedPlan;
    await ready.testApp.app.inject({ method: 'DELETE', url: '/api/sessions/current', cookies: ready.cookies });
    const afterLogout = await currentPlan(ready);
    const freshCookies = sessionCookieFrom(await logIn(ready.testApp.app, ready.traveler));

    const reopened = await currentPlan(ready, freshCookies);

    expect(afterLogout.statusCode).toBe(401);
    expect(reopened.statusCode).toBe(200);
    const plan = reopened.json() as SavedPlan;
    expect(plan.days).toHaveLength(8);
    expect(plan.days).toEqual(generated.days);
    expect(plan.stay).toEqual(generated.stay);
  });

  // @covers REQ-TRV-018@v1
  test('restores the first of two versions, shows its Plan, and lists three versions with none removed', async () => {
    const ready = await aTravelerWithATrip();
    theAiWillSuggest(ready.testApp, 'The first idea');
    await generatePlan(ready);
    theAiWillSuggest(ready.testApp, 'The second idea');
    await generatePlan(ready);
    expect(firstActivityTitle((await currentPlan(ready)).json() as SavedPlan)).toBe('The second idea');

    const restored = await restoreVersion(ready, 1);

    expect(restored.statusCode).toBe(201);
    expect(restored.json()).toMatchObject({ version: 3, source: 'restore' });
    expect(firstActivityTitle((await currentPlan(ready)).json() as SavedPlan)).toBe('The first idea');
    expect((await versionsOf(ready)).map((v) => v.version)).toEqual([3, 2, 1]);
  });

  // @covers REQ-TRV-018@v1
  test('lists 10 versions and no longer lists the oldest once an 11th is created', async () => {
    const ready = await aTravelerWithATrip();
    for (let made = 1; made <= 10; made += 1) {
      expect((await generatePlan(ready)).statusCode).toBe(201);
    }
    expect(await versionsOf(ready)).toHaveLength(10);

    await generatePlan(ready);

    const versions: PlanVersionSummary[] = await versionsOf(ready);
    expect(versions).toHaveLength(10);
    expect(versions.map((v) => v.version)).not.toContain(1);
    expect(versions[0]?.version).toBe(11);
  });

  // @covers REQ-TRV-018@v1
  test('answers 200 and changes nothing when the newest version is restored', async () => {
    const ready = await aTravelerWithATrip();
    await generatePlan(ready);
    await generatePlan(ready);
    const before = await versionsOf(ready);

    const response = await restoreVersion(ready, 2);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ version: 2 });
    expect(await versionsOf(ready)).toEqual(before);
  });

  // @covers REQ-TRV-018@v1
  test('answers 404 for a version that does not exist and changes nothing', async () => {
    const ready = await aTravelerWithATrip();
    await generatePlan(ready);

    const response = await restoreVersion(ready, 9);

    expect(response.statusCode).toBe(404);
    expect(await versionsOf(ready)).toHaveLength(1);
  });
});

describe('a Trip that changes while its Plan is being generated', () => {
  // @covers REQ-TRV-017@v1
  test('answers 409 TRIP_CHANGED, saves nothing, and leaves the Trip Draft', async () => {
    const ready = await aTravelerWithATrip();
    ready.testApp.ai.replyWith(() => {
      ready.testApp.db.update(trips).set({ endDate: '2026-10-16' }).where(eq(trips.id, ready.tripId)).run();
      return aPlanReplyText({ dayCount: 8 });
    });

    const response = await generatePlan(ready);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'TRIP_CHANGED' });
    expect((await currentPlan(ready)).statusCode).toBe(404);
    expect((await listedTrips(ready.testApp.app, ready.cookies))[0]?.status).toBe('Draft');
  });
});

describe('who may read and change a Trip\'s Plan', () => {
  // @covers REQ-TRV-018@v1
  test('gives a Trip that is absent, deleted or someone else\'s the same 404 on every Plan route', async () => {
    const ready = await aTravelerWithATrip();
    await generatePlan(ready);
    const other = await aLoggedInTraveler(ready.testApp.app, { email: 'other@example.com' });
    const absent = { ...ready, tripId: 'no-such-trip' };
    await ready.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${ready.tripId}`, cookies: ready.cookies });

    const outcomes = await Promise.all(
      [
        currentPlan(absent),
        currentPlan(ready),
        currentPlan(ready, other.cookies),
        ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}/plan/versions`, cookies: ready.cookies }),
        ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}/plan/versions`, cookies: other.cookies }),
        restoreVersion(ready, 1),
        restoreVersion(ready, 1, other.cookies),
      ].map(async (pending) => {
        const response = await pending;
        return [response.statusCode, response.json<{ code: string }>().code];
      }),
    );

    expect(outcomes).toEqual(Array.from({ length: 7 }, () => [404, 'TRIP_NOT_FOUND']));
  });

  // @covers REQ-TRV-018@v1
  test('answers 401 to a caller who is not logged in, on every Plan route', async () => {
    const ready = await aTravelerWithATrip();
    await generatePlan(ready);

    const statuses = await Promise.all([
      currentPlan(ready, {}),
      ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}/plan/versions` }),
      restoreVersion(ready, 1, {}),
    ]).then((responses) => responses.map((response) => response.statusCode));

    expect(statuses).toEqual([401, 401, 401]);
  });
});

describe('restarting the application', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  // @covers REQ-TRV-019@v1
  test('returns the saved Trip and its Plan unchanged to its owner, with the same session', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'trv-restart-'));
    directories.push(directory);
    const databasePath = join(directory, 'trv.sqlite');
    const first = await aTravelerWithATrip({ databasePath });
    const generated = (await generatePlan(first)).json() as SavedPlan;
    const tripBefore = (await first.testApp.app.inject({ method: 'GET', url: `/api/trips/${first.tripId}`, cookies: first.cookies })).json() as TripView;
    await first.testApp.stop();

    const restarted = await buildTestApp({ databasePath, now: TODAY });
    const tripAfter = await restarted.app.inject({ method: 'GET', url: `/api/trips/${first.tripId}`, cookies: first.cookies });
    const planAfter = await restarted.app.inject({ method: 'GET', url: `/api/trips/${first.tripId}/plan`, cookies: first.cookies });

    expect(tripAfter.statusCode).toBe(200);
    expect(tripAfter.json()).toEqual(tripBefore);
    expect(planAfter.statusCode).toBe(200);
    expect(planAfter.json()).toEqual(generated);
    await restarted.stop();
  });
});

describe('a Trip whose dates have passed', () => {
  // @covers REQ-TRV-097@v1
  test('opens for its owner showing the Trip and its Plan, today being 2026-09-23 and the Trip having run 2026-09-01 to 2026-09-05', async () => {
    const ready = await aTravelerWithATrip({
      now: new Date('2026-08-30T09:00:00Z'),
      trip: { startDate: '2026-09-01', endDate: '2026-09-05' },
    });
    theAiWillSuggest(ready.testApp, 'A five-day idea', 5);
    const generation = await generatePlan(ready);
    expect(generation.statusCode).toBe(201);
    const generated = generation.json() as SavedPlan;
    ready.testApp.clock.advanceBy(Date.parse('2026-09-23T09:00:00Z') - Date.parse('2026-08-30T09:00:00Z'));
    expect(ready.testApp.clock.now().toISOString().slice(0, 10)).toBe('2026-09-23');

    const laterCookies = sessionCookieFrom(await logIn(ready.testApp.app, ready.traveler));

    const trip = await ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}`, cookies: laterCookies });
    const plan = await currentPlan(ready, laterCookies);

    expect(trip.statusCode).toBe(200);
    expect(trip.json()).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-05', status: 'Planned' });
    expect(plan.statusCode).toBe(200);
    expect(plan.json()).toEqual(generated);
  });
});
