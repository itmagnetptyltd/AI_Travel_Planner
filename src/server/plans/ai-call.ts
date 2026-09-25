import { randomUUID } from 'node:crypto';
import { and, count, eq, gte, inArray } from 'drizzle-orm';
import { AiUnavailableError, type AiReply, type AiRequest, type AiService } from '../ai/ai-service';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { aiRequests } from '../db/schema';
import { CHAT_LIMIT_KINDS, PLAN_LIMIT_KINDS, type AiRequestKind } from '../../shared/ai-limits';
import type { AiUsageLimitService } from './ai-usage-limit-service';
import type { PlanPrompt } from './plan-prompt';
import type { Executor } from './plan-store';

export interface AiCallSettings {
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
  readonly inputCostMicroUsdPerMTok: number;
  readonly outputCostMicroUsdPerMTok: number;
}

/** `reason` is safe to log: it never holds request text, reply text or a key. */
export interface AiUnavailable {
  readonly ok: false;
  readonly error: 'ai-unavailable';
  readonly reason: string;
}

export interface LimitReached {
  readonly ok: false;
  readonly error: 'limit-reached';
  /** Which limit it was: the one on Plan requests, or the one on chat messages. */
  readonly scope: 'plan' | 'chat';
  readonly limit: number;
  readonly resetsAt: Date;
}

export type Reservation = { readonly ok: true; readonly recordId: string } | LimitReached;

export interface AiCaller {
  /**
   * Counts today's requests of the same class (Plan requests, or chat messages) and records this one, in a
   * single transaction, or says the limit is reached. SQLite runs it without interruption, so two simultaneous
   * requests cannot both see room for one more.
   */
  reserve(kind: AiRequestKind, accountId: string, tripId: string, requestText: string): Reservation;
  /** Asks the AI. On any failure the record is settled as failed and the caller gets the refusal to return. */
  ask(recordId: string, prompt: PlanPrompt): Promise<{ readonly reply: AiReply } | { readonly refusal: AiUnavailable }>;
  /** Records the reply and its cost on the request, as failed or succeeded. Pass `within` to join a transaction. */
  settle(recordId: string, status: 'succeeded' | 'failed', reply: AiReply, within?: Executor): void;
  /**
   * Records the reply as succeeded and runs `save` in the same transaction, so nothing is saved without its
   * record. If `save` throws, the record is settled as failed and the error goes on.
   */
  saveWithin<T>(recordId: string, reply: AiReply, save: (tx: Executor) => T): T;
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

export function createAiCaller(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly ai: AiService;
  readonly limits: AiUsageLimitService;
  readonly settings: AiCallSettings;
}): AiCaller {
  const { db, clock, ai, limits, settings } = deps;

  const costOf = (reply: AiReply) =>
    Math.round(
      (reply.inputTokens * settings.inputCostMicroUsdPerMTok + reply.outputTokens * settings.outputCostMicroUsdPerMTok) /
        TOKENS_PER_MILLION,
    );

  const settle: AiCaller['settle'] = (recordId, status, reply, within = db) => {
    within
      .update(aiRequests)
      .set({ status, replyText: reply.text, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens, costMicroUsd: costOf(reply) })
      .where(eq(aiRequests.id, recordId))
      .run();
  };

  return {
    reserve(kind, accountId, tripId, requestText) {
      const scope = kind === 'chat' ? 'chat' : 'plan';
      const limit = scope === 'chat' ? limits.getDailyChatLimit() : limits.getDailyPlanGenerationLimit();
      const counted = scope === 'chat' ? CHAT_LIMIT_KINDS : PLAN_LIMIT_KINDS;
      const now = clock.now();
      const recordId = db.transaction((tx) => {
        const [made] = tx
          .select({ total: count() })
          .from(aiRequests)
          .where(
            and(
              eq(aiRequests.accountId, accountId),
              inArray(aiRequests.kind, counted),
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
            kind,
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
      return recordId === null
        ? { ok: false, error: 'limit-reached', scope, limit, resetsAt: new Date(startOfUtcDay(now).getTime() + DAY_MS) }
        : { ok: true, recordId };
    },

    async ask(recordId, prompt) {
      try {
        return { reply: await completeWithin(ai, { ...prompt, maxOutputTokens: settings.maxOutputTokens }, settings.timeoutMs) };
      } catch (error) {
        db.update(aiRequests).set({ status: 'failed' }).where(eq(aiRequests.id, recordId)).run();
        if (!(error instanceof AiUnavailableError)) throw error;
        return { refusal: { ok: false, error: 'ai-unavailable', reason: error.message } };
      }
    },

    settle,

    saveWithin(recordId, reply, save) {
      try {
        return db.transaction((tx) => {
          settle(recordId, 'succeeded', reply, tx);
          return save(tx);
        });
      } catch (error) {
        settle(recordId, 'failed', reply);
        throw error;
      }
    },
  };
}
