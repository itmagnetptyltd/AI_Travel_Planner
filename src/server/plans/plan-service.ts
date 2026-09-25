import { randomUUID } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import { AiUnavailableError, requestTextOf, type AiReply, type AiRequest, type AiService } from '../ai/ai-service';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { aiRequests, destinations } from '../db/schema';
import type { TripService } from '../trips/trip-service';
import type { SavedPlan } from '../../shared/plan-schemas';
import type { TripView } from '../../shared/trip-schemas';
import type { AiUsageLimitService } from './ai-usage-limit-service';
import { buildPlanPrompt, preferencesForPrompt, type PlanPrompt } from './plan-prompt';
import { parsePlanReply } from './plan-reply';
import type { Executor, PlanStore } from './plan-store';

export interface PlanGenerationSettings {
  readonly timeoutMs: number;
  readonly destinationTextMaxChars: number;
  readonly maxOutputTokens: number;
  readonly inputCostMicroUsdPerMTok: number;
  readonly outputCostMicroUsdPerMTok: number;
}

export type GenerateResult =
  | { readonly ok: true; readonly plan: SavedPlan }
  | { readonly ok: false; readonly error: 'not-found' }
  /** The Trip's dates or currency were edited while the AI was answering, so its Plan no longer fits. */
  | { readonly ok: false; readonly error: 'trip-changed' }
  /** `reason` is safe to log: it never holds request text, reply text or a key. */
  | { readonly ok: false; readonly error: 'ai-unavailable'; readonly reason: string }
  | { readonly ok: false; readonly error: 'limit-reached'; readonly limit: number; readonly resetsAt: Date };

export interface PlanService {
  generate(ownerId: string, tripId: string): Promise<GenerateResult>;
}

type Destination = typeof destinations.$inferSelect;
type Refusal = Extract<GenerateResult, { ok: false }>;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKENS_PER_MILLION = 1_000_000;
const TIMEOUT_MESSAGE = 'The AI service did not answer in time.';
const NOT_FOUND: Refusal = { ok: false, error: 'not-found' };

const startOfUtcDay = (instant: Date) =>
  new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));

function promptFor(trip: TripView, destination: Destination, destinationTextMaxChars: number): PlanPrompt {
  return buildPlanPrompt({
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
    preferences: preferencesForPrompt({
      travelStyles: trip.travelStyles,
      interests: trip.interests,
      foodPreferences: trip.foodPreferences,
      transportation: trip.transportation,
      accommodation: trip.accommodation,
    }),
    destinationTextMaxChars,
  });
}

/** Whether a Plan made for `before` still fits the Trip as it is now. */
const isStillTheSameTrip = (before: TripView, now: TripView): boolean =>
  before.startDate === now.startDate && before.endDate === now.endDate && before.currency === now.currency;

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
  readonly store: PlanStore;
  readonly settings: PlanGenerationSettings;
}): PlanService {
  const { db, clock, ai, trips, limits, store, settings } = deps;

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

  const settle = (id: string, values: Partial<typeof aiRequests.$inferInsert>, executor: Executor = db) =>
    executor.update(aiRequests).set(values).where(eq(aiRequests.id, id)).run();

  /** Asks the AI. On any failure the record is settled as failed and the caller gets the result to return. */
  const ask = async (recordId: string, prompt: PlanPrompt): Promise<{ reply: AiReply } | { refusal: Refusal }> => {
    try {
      return { reply: await completeWithin(ai, { ...prompt, maxOutputTokens: settings.maxOutputTokens }, settings.timeoutMs) };
    } catch (error) {
      settle(recordId, { status: 'failed' });
      if (!(error instanceof AiUnavailableError)) throw error;
      return { refusal: { ok: false, error: 'ai-unavailable', reason: error.message } };
    }
  };

  /**
   * Saves what the AI answered. The AI took up to minutes, so the Trip is read again first: a Plan is
   * never saved onto a Trip that was deleted, or whose dates or currency changed, in the meantime. The
   * record and the saved Plan commit together, so a Plan is never saved without its record.
   */
  const finish = (ownerId: string, trip: TripView, recordId: string, reply: AiReply): GenerateResult => {
    const parsed = parsePlanReply(reply.text, trip);
    const outcome = {
      replyText: reply.text,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      costMicroUsd: costOf(reply),
    };
    if (!parsed.ok) {
      settle(recordId, { status: 'failed', ...outcome });
      return { ok: false, error: 'ai-unavailable', reason: `The AI reply was not a usable Plan (${parsed.problem}).` };
    }
    try {
      return db.transaction((tx): GenerateResult => {
        settle(recordId, { status: 'succeeded', ...outcome }, tx);
        const now = trips.getForOwner(ownerId, trip.id);
        if (!now) return NOT_FOUND;
        if (!isStillTheSameTrip(trip, now)) return { ok: false, error: 'trip-changed' };
        return { ok: true, plan: store.save(trip.id, parsed.plan, 'generation', tx) };
      });
    } catch (error) {
      settle(recordId, { status: 'failed', ...outcome });
      throw error;
    }
  };

  return {
    async generate(ownerId, tripId): Promise<GenerateResult> {
      const trip = trips.getForOwner(ownerId, tripId);
      const destination = trip ? db.select().from(destinations).where(eq(destinations.id, trip.destination.id)).get() : undefined;
      if (!trip || !destination) return NOT_FOUND;

      const prompt = promptFor(trip, destination, settings.destinationTextMaxChars);
      const limit = limits.getDailyPlanGenerationLimit();
      const now = clock.now();
      const recordId = reserve(ownerId, trip.id, requestTextOf(prompt), limit, now);
      if (recordId === null) {
        return { ok: false, error: 'limit-reached', limit, resetsAt: new Date(startOfUtcDay(now).getTime() + DAY_MS) };
      }

      const answer = await ask(recordId, prompt);
      return 'refusal' in answer ? answer.refusal : finish(ownerId, trip, recordId, answer.reply);
    },
  };
}
