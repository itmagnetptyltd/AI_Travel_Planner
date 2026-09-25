import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { AiUnavailableError, requestTextOf } from '../../src/server/ai/ai-service';
import { accounts, aiRequests } from '../../src/server/db/schema';
import { createDestinationService } from '../../src/server/destinations/destination-service';
import { createAiUsageLimitService } from '../../src/server/plans/ai-usage-limit-service';
import {
  createPlanService,
  type GenerateResult,
  type PlanGenerationSettings,
} from '../../src/server/plans/plan-service';
import { createTripService } from '../../src/server/trips/trip-service';
import type { PlanView } from '../../src/shared/plan-schemas';
import { aDestination } from '../support/a-destination';
import { aPlanReplyText, anActivity } from '../support/a-plan-reply';
import { aTripInput, anOwner, TODAY } from '../support/a-trip';
import { aTestDatabase } from '../support/build-test-app';
import { aFixedClock } from '../support/fixed-clock';
import { anAiDouble, type AiDouble } from '../support/an-ai-double';
import { DAY, generationsAlreadyMade } from '../support/an-ai-request';

const SETTINGS: PlanGenerationSettings = {
  timeoutMs: 1_000,
  destinationTextMaxChars: 2_000,
  maxOutputTokens: 8_000,
  inputCostMicroUsdPerMTok: 3_000_000,
  outputCostMicroUsdPerMTok: 15_000_000,
};

function aPlanService(settings: Partial<PlanGenerationSettings> = {}, ai: AiDouble = anAiDouble()) {
  const db = aTestDatabase();
  const clock = aFixedClock(TODAY);
  const trips = createTripService({ db, clock });
  const limits = createAiUsageLimitService({ db, clock });
  const destinations = createDestinationService({ db, clock });
  const plans = createPlanService({ db, clock, ai, trips, limits, settings: { ...SETTINGS, ...settings } });
  const ownerId = anOwner(db);
  const kyotoId = destinations.add(aDestination()).id;

  const aTrip = (overrides: Parameters<typeof aTripInput>[1] = {}) => {
    const created = trips.create(ownerId, aTripInput(kyotoId, overrides));
    if (!created.ok) throw new Error(`Creating the Trip failed: ${created.error}`);
    return created.trip;
  };
  return { db, clock, ai, trips, limits, plans, ownerId, aTrip };
}

function planOf(result: GenerateResult): PlanView {
  if (!result.ok) throw new Error(`Expected a Plan, got ${result.error}`);
  return result.plan;
}

describe('generating a Plan', () => {
  // @covers REQ-TRV-026@v1
  test('gives a Trip from 2026-10-10 to 2026-10-17 a Plan of 8 Days dated 10 to 17', async () => {
    const { plans, ownerId, aTrip } = aPlanService();
    const trip = aTrip();

    const plan = planOf(await plans.generate(ownerId, trip.id));

    expect(plan.days.map((day) => day.date)).toEqual([
      '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13',
      '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17',
    ]);
  });

  // @covers REQ-TRV-026@v1
  test('gives a Trip from 2026-10-01 to 2026-10-14 a Plan of 14 Days in order', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanService();
    ai.replyWith(aPlanReplyText({ dayCount: 14 }));
    const trip = aTrip({ startDate: '2026-10-01', endDate: '2026-10-14' });

    const plan = planOf(await plans.generate(ownerId, trip.id));

    expect(plan.days).toHaveLength(14);
    expect(plan.days[0]?.date).toBe('2026-10-01');
    expect(plan.days[13]?.date).toBe('2026-10-14');
  });

  // @covers REQ-TRV-026@v1
  test('gives every Day of the Plan at least one Activity', async () => {
    const { plans, ownerId, aTrip } = aPlanService();

    const plan = planOf(await plans.generate(ownerId, aTrip().id));

    expect(plan.days.every((day) => day.activities.length >= 1)).toBe(true);
  });

  // @covers REQ-TRV-026@v1
  test('sends the AI one request and shows the Plan it returned', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanService();
    ai.replyWith(
      aPlanReplyText({ days: Array.from({ length: 8 }, (_, i) => ({ dayNumber: i + 1, activities: [anActivity({ title: 'Kinkaku-ji at dawn' })] })) }),
    );

    const plan = planOf(await plans.generate(ownerId, aTrip().id));

    expect(ai.requests).toHaveLength(1);
    expect(plan.days[0]?.activities[0]?.title).toBe('Kinkaku-ji at dawn');
  });

  // @covers REQ-TRV-026@v1
  test('tells the AI the Destination, the dates, the adults, the children and the budget of that Trip', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanService();

    await plans.generate(ownerId, aTrip().id);

    const [request] = ai.requests;
    const text = requestTextOf(request ?? { system: '', user: '' });
    expect(text).toContain('Kyoto');
    expect(text).toContain('2026-10-10');
    expect(text).toContain('2 adults, 2 children');
    expect(text).toContain('5000 USD');
    expect(text).toContain('Fushimi Inari shrine');
  });

  // @covers REQ-TRV-027@v1
  test('gives the stay summary an accommodation type, a suggested area and a nightly cost estimate', async () => {
    const { plans, ownerId, aTrip } = aPlanService();

    const { stay } = planOf(await plans.generate(ownerId, aTrip().id));

    expect(stay.accommodationType).not.toBe('');
    expect(stay.suggestedArea).not.toBe('');
    expect(stay.nightlyCostEstimate).toBeGreaterThanOrEqual(0);
  });

  test('refuses a Trip that is not the caller\'s and never calls the AI', async () => {
    const { plans, ai, aTrip } = aPlanService();
    const trip = aTrip();

    const result = await plans.generate('someone-else', trip.id);

    expect(result).toEqual({ ok: false, error: 'not-found' });
    expect(ai.requests).toHaveLength(0);
  });
});

describe('the daily generation limit', () => {
  // @covers REQ-TRV-026@v1
  test('refuses a Traveler with 20 generations today, says when it resets, and sends the AI nothing', async () => {
    const { db, plans, ai, ownerId, aTrip } = aPlanService();
    generationsAlreadyMade(db, ownerId, 20, new Date(TODAY.getTime() - 60_000));

    const result = await plans.generate(ownerId, aTrip().id);

    expect(result).toEqual({ ok: false, error: 'limit-reached', limit: 20, resetsAt: new Date('2026-09-24T00:00:00Z') });
    expect(ai.requests).toHaveLength(0);
  });

  // @covers REQ-TRV-026@v1
  test('lets a Traveler who reached 20 yesterday generate today', async () => {
    const { db, plans, ownerId, aTrip } = aPlanService();
    generationsAlreadyMade(db, ownerId, 20, new Date(TODAY.getTime() - DAY));

    const result = await plans.generate(ownerId, aTrip().id);

    expect(result.ok).toBe(true);
  });

  // @covers REQ-TRV-026@v1
  test('refuses the third generation of the day when the limit is set to 2', async () => {
    const { limits, plans, ai, ownerId, aTrip } = aPlanService();
    limits.setDailyPlanGenerationLimit(2);
    const trip = aTrip();

    const results = [
      await plans.generate(ownerId, trip.id),
      await plans.generate(ownerId, trip.id),
      await plans.generate(ownerId, trip.id),
    ];

    expect(results.map((result) => result.ok)).toEqual([true, true, false]);
    expect(results[2]).toMatchObject({ error: 'limit-reached', limit: 2 });
    expect(ai.requests).toHaveLength(2);
  });

  // @covers REQ-TRV-091@v1
  test('refuses the sixth generation of the day, with the reset time, when the limit is set to 5', async () => {
    const { limits, plans, ownerId, aTrip } = aPlanService();
    limits.setDailyPlanGenerationLimit(5);
    const trip = aTrip();
    for (let made = 0; made < 5; made += 1) {
      expect((await plans.generate(ownerId, trip.id)).ok).toBe(true);
    }

    const sixth = await plans.generate(ownerId, trip.id);

    expect(sixth).toEqual({ ok: false, error: 'limit-reached', limit: 5, resetsAt: new Date('2026-09-24T00:00:00Z') });
  });

  // @covers REQ-TRV-026@v1
  test('lets only one of two simultaneous requests through when one generation is left', async () => {
    const { limits, plans, ai, ownerId, aTrip } = aPlanService();
    limits.setDailyPlanGenerationLimit(1);
    const trip = aTrip();

    const results = await Promise.all([plans.generate(ownerId, trip.id), plans.generate(ownerId, trip.id)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(ai.requests).toHaveLength(1);
  });
});

describe('when the AI fails', () => {
  // @covers REQ-TRV-029@v2
  test('answers ai-unavailable and leaves the Trip as it was', async () => {
    const { plans, ai, trips, ownerId, aTrip } = aPlanService();
    ai.failWith();
    const trip = aTrip();

    const result = await plans.generate(ownerId, trip.id);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable' });
    expect(trips.getForOwner(ownerId, trip.id)).toEqual(trip);
  });

  // @covers REQ-TRV-029@v2
  test('answers ai-unavailable when the AI does not answer within the timeout', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanService({ timeoutMs: 30 });
    ai.neverAnswer();

    const result = await plans.generate(ownerId, aTrip().id);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable', reason: expect.stringContaining('in time') });
  });

  // @covers REQ-TRV-029@v2
  test('answers ai-unavailable when the reply is not a usable Plan', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanService();
    ai.replyWith(aPlanReplyText({ dayCount: 3 }));

    const result = await plans.generate(ownerId, aTrip().id);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable', reason: expect.stringContaining('wrong-days') });
  });
});

describe('when the AI service breaks unexpectedly', () => {
  // @covers REQ-TRV-029@v2
  test('settles the record as failed rather than leaving it pending, and lets the error through', async () => {
    const { db, plans, ai, ownerId, aTrip } = aPlanService();
    ai.failWith(new TypeError('unexpected shape'));

    await expect(plans.generate(ownerId, aTrip().id)).rejects.toThrow('unexpected shape');

    expect(db.select().from(aiRequests).all().map((row) => row.status)).toEqual(['failed']);
  });
});

describe('when the AI service throws before it returns anything', () => {
  // @covers REQ-TRV-029@v2
  test('answers ai-unavailable, and the timeout does not outlive the request', async () => {
    const { plans, ai, ownerId, aTrip } = aPlanService({ timeoutMs: 20 });
    ai.throwSynchronously(new AiUnavailableError('refused to start'));
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', record);

    const result = await plans.generate(ownerId, aTrip().id);
    await new Promise((resolve) => setTimeout(resolve, 60));
    process.off('unhandledRejection', record);

    expect(result).toMatchObject({ ok: false, error: 'ai-unavailable', reason: 'refused to start' });
    expect(unhandled).toEqual([]);
  });
});

describe('what the AI is told', () => {
  // @covers REQ-TRV-033@v2
  test('never includes the Traveler\'s email address, the Trip name or the account identifier', async () => {
    const { db, plans, ai, ownerId, aTrip } = aPlanService();
    const trip = aTrip({ name: 'Jane Citizen 40th birthday' });
    const owner = db.select().from(accounts).where(eq(accounts.id, ownerId)).get();

    await plans.generate(ownerId, trip.id);

    const [request] = ai.requests;
    const text = requestTextOf(request ?? { system: '', user: '' });
    expect(owner?.email).toBeTruthy();
    expect(text).not.toContain(owner?.email ?? 'unreachable');
    expect(text).not.toContain('Jane Citizen');
    expect(text).not.toContain('40th birthday');
    expect(text).not.toContain(ownerId);
  });
});

describe('the stored record of a generation', () => {
  // @covers REQ-TRV-034@v1
  test('keeps the text sent, the text returned, the token counts and the cost', async () => {
    const { db, plans, ai, ownerId, aTrip } = aPlanService();

    await plans.generate(ownerId, aTrip().id);

    const [row] = db.select().from(aiRequests).all();
    expect(row).toMatchObject({
      accountId: ownerId,
      kind: 'plan-generation',
      status: 'succeeded',
      inputTokens: 1_000,
      outputTokens: 2_000,
      costMicroUsd: 33_000,
    });
    expect(row?.requestText).toBe(requestTextOf(ai.requests[0] ?? { system: '', user: '' }));
    expect(row?.replyText).toContain('"dayNumber":1');
  });

  // @covers REQ-TRV-034@v1
  test('records a failed generation as failed, with no reply text', async () => {
    const { db, plans, ai, ownerId, aTrip } = aPlanService();
    ai.failWith();

    await plans.generate(ownerId, aTrip().id);

    const [row] = db.select().from(aiRequests).all();
    expect(row).toMatchObject({ status: 'failed', replyText: null, inputTokens: 0, outputTokens: 0, costMicroUsd: 0 });
  });
});
