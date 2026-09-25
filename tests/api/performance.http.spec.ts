import { describe, expect, test } from 'vitest';
import { ordinaryPagesJourney, signIn } from '../../scripts/load-journey';
import { runUsers, summarise } from '../../scripts/load-runner';
import { aTravelerWithAShoppingPlan } from '../support/a-chat';
import { aPlanReplyText } from '../support/a-plan-reply';
import { aPlanServiceRig } from '../support/a-plan-service';
import { listening } from '../support/a-chat-stream';
import { aWebRoot } from '../support/a-web-root';

/** The agreed load and the agreed time (ANSWERS.md, "Performance targets"). */
const SIMULTANEOUS_USERS = 25;
const AGREED_P95_MS = 2_000;
const ROUNDS_PER_USER = 6;

describe('the application with 25 users at the same time, over real HTTP', () => {
  // A slow application must fail on the time it measured, not on the test running out of time.
  // @covers REQ-TRV-080@v1
  test('answers 95% of ordinary page requests in under 2 seconds, and fails none of them', { timeout: 120_000 }, async () => {
    const ready = await aTravelerWithAShoppingPlan({ webRoot: await aWebRoot() });
    const baseUrl = await listening(ready.testApp);
    const { cookie } = await signIn(baseUrl, { email: ready.traveler.email, password: ready.traveler.password });

    const samples = await runUsers(SIMULTANEOUS_USERS, () => ordinaryPagesJourney(baseUrl, cookie, { rounds: ROUNDS_PER_USER, thinkMs: 25 }));
    const summary = summarise(samples);

    expect(summary.failures).toEqual([]);
    expect(summary.p95Ms).toBeLessThan(AGREED_P95_MS);
  });

  // @covers REQ-TRV-080@v1
  test('is measured over every kind of ordinary page: the page itself, what it loads, and the reads behind the screens', async () => {
    const ready = await aTravelerWithAShoppingPlan({ webRoot: await aWebRoot() });
    const baseUrl = await listening(ready.testApp);
    const { cookie } = await signIn(baseUrl, { email: ready.traveler.email, password: ready.traveler.password });

    const samples = await runUsers(SIMULTANEOUS_USERS, () => ordinaryPagesJourney(baseUrl, cookie, { rounds: 2, thinkMs: 0 }));

    const names = new Set(samples.map((sample) => sample.name.replace(/[0-9a-f-]{36}/g, ':id')));
    expect([...names].sort()).toEqual(
      [
        'GET /',
        'GET /assets/index-abc123.css',
        'GET /assets/index-abc123.js',
        'GET /api/destinations',
        'GET /api/trips',
        'GET /api/trips/:id',
        'GET /api/trips/:id/budget',
        'GET /api/trips/:id/plan',
      ].sort(),
    );
    expect(samples).toHaveLength(SIMULTANEOUS_USERS * 2 * 8);
  });

  // @covers REQ-TRV-080@v1
  test('uses the one session the user signed in with, and times signing in once, apart from the pages', async () => {
    const ready = await aTravelerWithAShoppingPlan({ webRoot: await aWebRoot() });
    const baseUrl = await listening(ready.testApp);

    const { cookie, sample } = await signIn(baseUrl, { email: ready.traveler.email, password: ready.traveler.password });

    expect(cookie).toMatch(/=/);
    expect(sample).toMatchObject({ name: 'POST /api/sessions', ok: true });
  });

  // @covers REQ-TRV-080@v1
  test('reports a sign-in that was refused, rather than measuring pages nobody could see', async () => {
    const ready = await aTravelerWithAShoppingPlan({ webRoot: await aWebRoot() });
    const baseUrl = await listening(ready.testApp);

    const wrongPassword = 'not-the-password-at-all'; // itm-sdlc:allow-secret - synthetic wrong password

    await expect(signIn(baseUrl, { email: ready.traveler.email, password: wrongPassword })).rejects.toThrow(/sign in/i);
  });
});

describe('the time the application itself adds to a Plan', () => {
  // @covers REQ-TRV-080@v1
  test('is well under a second for a 7-Day Plan the AI answers at once, so the 60 seconds is the AI’s to spend', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanServiceRig();
    ai.replyWith(aPlanReplyText({ dayCount: 7 }));
    const trip = aTrip({ startDate: '2026-10-10', endDate: '2026-10-16' });
    const startedAt = performance.now();

    const result = await plans.generate(ownerId, trip.id);

    expect(result).toMatchObject({ ok: true });
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
