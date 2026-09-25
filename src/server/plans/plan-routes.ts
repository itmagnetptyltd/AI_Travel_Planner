import type { FastifyInstance } from 'fastify';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE, PLAN_LIMIT_REACHED } from '../../shared/plan-schemas';
import type { PlanService } from './plan-service';

/** `2026-09-24 00:00 UTC` — the reset time as the Traveler is told it. */
function resetTimeText(resetsAt: Date): string {
  const iso = resetsAt.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * Generating a Plan spends a paid AI call, so only the Trip's owner may do it. A Trip that is absent,
 * deleted or someone else's gets the same 404 as everywhere else (REQ-TRV-007).
 */
export async function planRoutes(
  app: FastifyInstance,
  deps: { readonly sessions: SessionService; readonly plans: PlanService },
): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/api/trips/:id/plan',
    { preHandler: requireTraveler(deps.sessions) },
    async (request, reply) => {
      const result = await deps.plans.generate(request.accountId ?? '', request.params.id);
      if (result.ok) return reply.code(201).send(result.plan);
      switch (result.error) {
        case 'not-found':
          return reply.code(404).send({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
        case 'limit-reached':
          return reply.code(429).send({
            code: PLAN_LIMIT_REACHED,
            message: `You have reached today's limit of ${result.limit} Plan generations. It resets at ${resetTimeText(result.resetsAt)}.`,
            limit: result.limit,
            resetsAt: result.resetsAt.toISOString(),
          });
        case 'ai-unavailable':
          request.log.warn({ tripId: request.params.id, reason: result.reason }, 'Plan generation failed');
          return reply.code(503).send({ code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE });
      }
    },
  );
}
