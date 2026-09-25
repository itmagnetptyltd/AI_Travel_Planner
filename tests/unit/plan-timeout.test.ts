import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { aiRequests } from '../../src/server/db/schema';
import { aPlanReplyText } from '../support/a-plan-reply';
import { aPlanServiceRig } from '../support/a-plan-service';

/** The agreed limit: a Plan the AI has not answered for this long is given up on (ANSWERS.md, "Performance targets"). */
const AGREED_TIMEOUT_MS = 120_000;
const AGREED_SEVEN_DAY_MS = 60_000;

const SEVEN_DAY_TRIP = { startDate: '2026-10-10', endDate: '2026-10-16' };

describe('a Plan the AI does not answer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // @covers REQ-TRV-080@v1
  test('is still being waited for at 119.999 seconds and given up on at 120, when the AI is never heard from', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanServiceRig({ timeoutMs: AGREED_TIMEOUT_MS });
    ai.neverAnswer();
    let outcome: Awaited<ReturnType<typeof plans.generate>> | undefined;
    const pending = plans.generate(ownerId, aTrip().id).then((result) => {
      outcome = result;
    });

    await vi.advanceTimersByTimeAsync(AGREED_TIMEOUT_MS - 1);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(outcome).toMatchObject({ ok: false, error: 'ai-unavailable' });
  });

  // @covers REQ-TRV-080@v1
  test('leaves the Trip without a Plan, and records the request as failed, when it is given up on', async () => {
    const { plans, ai, db, store, ownerId, aTrip } = aPlanServiceRig({ timeoutMs: AGREED_TIMEOUT_MS });
    ai.neverAnswer();
    const trip = aTrip();
    const pending = plans.generate(ownerId, trip.id);

    await vi.advanceTimersByTimeAsync(AGREED_TIMEOUT_MS);
    await pending;

    expect(store.current(trip.id)).toBeNull();
    expect(db.select().from(aiRequests).all().map((row) => row.status)).toEqual(['failed']);
  });

  // @covers REQ-TRV-080@v1
  test('is a 7-Day Plan saved 59 seconds after it was asked for, when the AI takes 59 seconds: nothing else waits', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanServiceRig({ timeoutMs: AGREED_TIMEOUT_MS });
    ai.replyWithStream(async () => {
      await new Promise((resolve) => setTimeout(resolve, AGREED_SEVEN_DAY_MS - 1_000));
      return aPlanReplyText({ dayCount: 7 });
    });
    const startedAt = Date.now();
    const pending = plans.generate(ownerId, aTrip(SEVEN_DAY_TRIP).id);

    await vi.advanceTimersByTimeAsync(AGREED_SEVEN_DAY_MS - 1_000);
    const result = await pending;

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.plan.days).toHaveLength(7);
    expect(Date.now() - startedAt).toBe(AGREED_SEVEN_DAY_MS - 1_000);
  });
});
