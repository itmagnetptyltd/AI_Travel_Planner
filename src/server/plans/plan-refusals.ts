import type { FastifyReply, FastifyRequest } from 'fastify';
import { CHAT_LIMIT_REACHED } from '../../shared/chat-schemas';
import {
  ACTIVITY_NOT_FOUND,
  AI_UNAVAILABLE,
  AI_UNAVAILABLE_MESSAGE,
  DAY_NOT_FOUND,
  EDITS_WOULD_BE_REPLACED,
  PLAN_LIMIT_REACHED,
  PLAN_NOT_FOUND,
  TRIP_CHANGED,
} from '../../shared/plan-schemas';
import type { GenerateResult } from './plan-service';
import type { RegenerationRefusal } from './plan-regeneration-service';

type Refusal = Extract<GenerateResult, { ok: false }> | RegenerationRefusal;

/** `2026-09-24 00:00 UTC` — the reset time as the Traveler is told it. */
function resetTimeText(resetsAt: Date): string {
  const iso = resetsAt.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export const tripNotFound = (reply: FastifyReply) =>
  reply.code(404).send({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });

/**
 * Says why a request that may ask the AI was refused. Every such request answers the same way, so a
 * Traveler sees the same message for the same problem whichever part of the Plan they were changing.
 * A Trip that is absent, deleted or someone else's is the same 404 as everywhere (REQ-TRV-007).
 */
export function replyToRefusal(request: FastifyRequest, reply: FastifyReply, refusal: Refusal, what: string) {
  switch (refusal.error) {
    case 'not-found':
      return tripNotFound(reply);
    case 'no-plan':
      return reply.code(404).send({ code: PLAN_NOT_FOUND, message: 'This Trip has no Plan yet.' });
    case 'day-not-found':
      return reply.code(404).send({ code: DAY_NOT_FOUND, message: 'That Day is not in the Plan.' });
    case 'activity-not-found':
      return reply.code(404).send({ code: ACTIVITY_NOT_FOUND, message: 'That Activity is not in the Plan.' });
    case 'limit-reached':
      return reply.code(429).send({
        code: refusal.scope === 'chat' ? CHAT_LIMIT_REACHED : PLAN_LIMIT_REACHED,
        message: `You have reached today's limit of ${refusal.limit} ${refusal.scope === 'chat' ? 'chat messages' : 'Plan generations'}. It resets at ${resetTimeText(refusal.resetsAt)}.`,
        limit: refusal.limit,
        resetsAt: refusal.resetsAt.toISOString(),
      });
    case 'trip-changed':
      return reply.code(409).send({
        code: TRIP_CHANGED,
        message: 'The Trip was changed while its Plan was being generated, so the Plan was not saved. Try again.',
      });
    case 'edits-would-be-replaced':
      return reply.code(409).send({
        code: EDITS_WOULD_BE_REPLACED,
        message: 'You changed some Activities yourself. Regenerating will replace them. Your current Plan stays as an earlier version you can restore.',
        days: refusal.days,
      });
    case 'ai-unavailable':
      request.log.warn({ params: request.params, reason: refusal.reason }, `${what} failed`);
      return reply.code(503).send({ code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE });
  }
}
