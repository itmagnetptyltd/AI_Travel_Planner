import { randomUUID } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import { AiUnavailableError, requestTextOf, type AiReply, type AiRequest, type AiService } from '../ai/ai-service';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { aiRequests, destinations } from '../db/schema';
import type { TripService } from '../trips/trip-service';
import type { PlanView } from '../../shared/plan-schemas';
import type { AiUsageLimitService } from './ai-usage-limit-service';
import { buildPlanPrompt } from './plan-prompt';
import { parsePlanReply } from './plan-reply';

export interface PlanGenerationSettings {
  readonly timeoutMs: number;
  readonly destinationTextMaxChars: number;
  readonly maxOutputTokens: number;
  readonly inputCostMicroUsdPerMTok: number;
  readonly outputCostMicroUsdPerMTok: number;
}

export type GenerateResult =
  | { readonly ok: true; readonly plan: PlanView }
  | { readonly ok: false; readonly error: 'not-found' }
  /** `reason` is safe to log: it never holds request text, reply text or a key. */
  | { readonly ok: false; readonly error: 'ai-unavailable'; readonly reason: string }
  | { readonly ok: false; readonly error: 'limit-reached'; readonly limit: number; readonly resetsAt: Date };

export interface PlanService {
  generate(ownerId: string, tripId: string): Promise<GenerateResult>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKENS_PER_MILLION = 1_000_000;
const TIMEOUT_MESSAGE = 'The AI service did not answer in time.';

const startOfUtcDay = (instant: Date) =>
  new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));

/** Calls the AI, giving up after `timeoutMs` even if the service ignores the abort signal. */
async function completeWithin(ai: AiService, request: Omit<AiRequest, 'signal'>, timeoutMs: number): Promise<AiReply> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let didTimeOut = false;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      didTimeOut = true;
      controller.abort();
      reject(new AiUnavailableError(TIMEOUT_MESSAGE));
    }, timeoutMs);
  });
  // Started inside a promise chain, so a service that throws before returning is still just a rejection.
  const answer = Promise.resolve().then(() => ai.complete({ ...request, signal: controller.signal }));
  answer.catch(() => undefined);
  try {
    return await Promise.race([answer, timedOut]);
  } catch (error) {
    if (didTimeOut) throw new AiUnavailableError(TIMEOUT_MESSAGE);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function createPlanService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly ai: AiService;
  readonly trips: TripService;
  readonly limits: AiUsageLimitService;
  readonly settings: PlanGenerationSettings;
}): PlanService {
  const { db, clock, ai, trips, limits, settings } = deps;

  const costOf = (reply: AiReply) =>
    Math.round(
      (reply.inputTokens * settings.inputCostMicroUsdPerMTok + reply.outputTokens * settings.outputCostMicroUsdPerMTok) /
        TOKENS_PER_MILLION,
    );

  /**
   * Counts today's generations and records this one in a single transaction. SQLite runs it without
   * interruption, so two simultaneous requests cannot both see room for one more.
   */
  const reserve = (accountId: string, tripId: string, requestText: string, limit: number, now: Date): string | null =>
    db.transaction((tx) => {
      const [made] = tx
        .select({ total: count() })
        .from(aiRequests)
        .where(
          and(
            eq(aiRequests.accountId, accountId),
            eq(aiRequests.kind, 'plan-generation'),
            gte(aiRequests.createdAt, startOfUtcDay(now)),
          ),
        )
        .all();
      if ((made?.total ?? 0) >= limit) return null;
      const id = randomUUID();
      tx.insert(aiRequests)
        .values({
          id,
          accountId,
          tripId,
          kind: 'plan-generation',
          status: 'pending',
          requestText,
          replyText: null,
          inputTokens: 0,
          outputTokens: 0,
          costMicroUsd: 0,
          createdAt: now,
        })
        .run();
      return id;
    });

  const settle = (id: string, values: Partial<typeof aiRequests.$inferInsert>) =>
    db.update(aiRequests).set(values).where(eq(aiRequests.id, id)).run();

  return {
    async generate(ownerId, tripId): Promise<GenerateResult> {
      const trip = trips.getForOwner(ownerId, tripId);
      const destination = trip
        ? db.select().from(destinations).where(eq(destinations.id, trip.destination.id)).get()
        : undefined;
      if (!trip || !destination) return { ok: false, error: 'not-found' };

      const prompt = buildPlanPrompt({
        destination: {
          name: destination.name,
          country: destination.country,
          description: destination.description,
          popularActivities: destination.popularActivities,
          travelInformation: destination.travelInformation,
        },
        startDate: trip.startDate,
        endDate: trip.endDate,
        dayCount: trip.dayCount,
        adults: trip.adults,
        children: trip.children,
        budget: trip.budget,
        currency: trip.currency,
        destinationTextMaxChars: settings.destinationTextMaxChars,
      });
      const requestText = requestTextOf(prompt);
      const limit = limits.getDailyPlanGenerationLimit();
      const now = clock.now();

      const recordId = reserve(ownerId, trip.id, requestText, limit, now);
      if (recordId === null) {
        return {
          ok: false,
          error: 'limit-reached',
          limit,
          resetsAt: new Date(startOfUtcDay(now).getTime() + DAY_MS),
        };
      }

      let reply: AiReply;
      try {
        reply = await completeWithin(ai, { ...prompt, maxOutputTokens: settings.maxOutputTokens }, settings.timeoutMs);
      } catch (error) {
        settle(recordId, { status: 'failed' });
        if (!(error instanceof AiUnavailableError)) throw error;
        return { ok: false, error: 'ai-unavailable', reason: error.message };
      }

      const parsed = parsePlanReply(reply.text, trip);
      settle(recordId, {
        status: parsed.ok ? 'succeeded' : 'failed',
        replyText: reply.text,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        costMicroUsd: costOf(reply),
      });
      return parsed.ok
        ? { ok: true, plan: parsed.plan }
        : { ok: false, error: 'ai-unavailable', reason: `The AI reply was not a usable Plan (${parsed.problem}).` };
    },
  };
}
