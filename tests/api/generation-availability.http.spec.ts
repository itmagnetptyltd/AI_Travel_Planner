import { describe, expect, test } from 'vitest';
import { aiRequests } from '../../src/server/db/schema';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE } from '../../src/shared/plan-schemas';
import { aPlanReplyText } from '../support/a-plan-reply';
import { aTravelerWithATrip, currentPlan, generatePlan } from '../support/a-saved-plan-journey';
import { untilTrue } from '../support/a-wait';

const OTHER_REQUEST_WITHIN_MS = 500;
const TIMEOUT_MS = 250;

describe('the application while a Plan is being generated', () => {
  // @covers REQ-TRV-080@v1
  test('keeps answering the same Traveler’s other requests promptly while the AI has not answered', async () => {
    const ready = await aTravelerWithATrip();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    ready.testApp.ai.replyWithStream(async () => {
      await held;
      return aPlanReplyText({ dayCount: 8 });
    });

    const generating = generatePlan(ready);
    await untilTrue(() => ready.testApp.ai.requests.length === 1);
    const others = ['/api/trips', `/api/trips/${ready.tripId}`, '/api/destinations', '/api/profile', `/api/trips/${ready.tripId}/chat`];
    const answered: { url: string; status: number; ms: number }[] = [];
    for (const url of others) {
      const startedAt = Date.now();
      const response = await ready.testApp.app.inject({ method: 'GET', url, cookies: ready.cookies });
      answered.push({ url, status: response.statusCode, ms: Date.now() - startedAt });
    }

    expect(answered.map((entry) => entry.status)).toEqual([200, 200, 200, 200, 200]);
    for (const entry of answered) expect(entry.ms).toBeLessThan(OTHER_REQUEST_WITHIN_MS);
    release();
    expect((await generating).statusCode).toBe(201);
  });

  // @covers REQ-TRV-080@v1
  test('shows nothing of a Plan until it is done: the Trip has none while the AI is still writing it', async () => {
    const ready = await aTravelerWithATrip();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    ready.testApp.ai.replyWithStream(async () => {
      await held;
      return aPlanReplyText({ dayCount: 8 });
    });

    const generating = generatePlan(ready);
    await untilTrue(() => ready.testApp.ai.requests.length === 1);

    expect((await currentPlan(ready)).statusCode).toBe(404);
    release();
    await generating;
    expect((await currentPlan(ready)).statusCode).toBe(200);
  });
});

describe('a Plan the AI does not answer in time', () => {
  // @covers REQ-TRV-080@v1
  test('is answered with the fallback message when the wait is over, the Trip unchanged and the request recorded as failed', async () => {
    const ready = await aTravelerWithATrip({ planSettings: { timeoutMs: TIMEOUT_MS } });
    ready.testApp.ai.neverAnswer();
    const startedAt = Date.now();

    const response = await generatePlan(ready);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(TIMEOUT_MS - 20);
    expect(Date.now() - startedAt).toBeLessThan(TIMEOUT_MS + 1_000);
    expect((await currentPlan(ready)).statusCode).toBe(404);
    expect(ready.testApp.db.select().from(aiRequests).all().map((row) => row.status)).toEqual(['failed']);
  });
});
