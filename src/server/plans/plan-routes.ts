import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import {
  AI_UNAVAILABLE,
  AI_UNAVAILABLE_MESSAGE,
  PLAN_LIMIT_REACHED,
  PLAN_NOT_FOUND,
  PLAN_VERSION_NOT_FOUND,
  TRIP_CHANGED,
} from '../../shared/plan-schemas';
import type { TripService } from '../trips/trip-service';
import type { PlanService } from './plan-service';
import type { PlanStore } from './plan-store';

/** `2026-09-24 00:00 UTC` — the reset time as the Traveler is told it. */
function resetTimeText(resetsAt: Date): string {
  const iso = resetsAt.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

const tripNotFound = (reply: FastifyReply) =>
  reply.code(404).send({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });

/**
 * Generating a Plan spends a paid AI call, and a saved Plan is the Traveler's own data, so only the
 * Trip's owner may reach any of these. A Trip that is absent, deleted or someone else's gets the same
 * 404 as everywhere else (REQ-TRV-007).
 */
export async function planRoutes(
  app: FastifyInstance,
  deps: {
    readonly sessions: SessionService;
    readonly plans: PlanService;
    readonly trips: TripService;
    readonly store: PlanStore;
  },
): Promise<void> {
  const loggedIn = requireTraveler(deps.sessions);
  const ownedTripId = (request: { accountId?: string; params: { id: string } }): string | null =>
    deps.trips.getForOwner(request.accountId ?? '', request.params.id) ? request.params.id : null;

  app.get<{ Params: { id: string } }>('/api/trips/:id/plan', { preHandler: loggedIn }, async (request, reply) => {
    const tripId = ownedTripId(request);
    if (tripId === null) return tripNotFound(reply);
    return deps.store.current(tripId) ?? reply.code(404).send({ code: PLAN_NOT_FOUND, message: 'This Trip has no Plan yet.' });
  });

  app.get<{ Params: { id: string } }>('/api/trips/:id/plan/versions', { preHandler: loggedIn }, async (request, reply) => {
    const tripId = ownedTripId(request);
    return tripId === null ? tripNotFound(reply) : { versions: deps.store.listVersions(tripId) };
  });

  app.post<{ Params: { id: string; version: string } }>(
    '/api/trips/:id/plan/versions/:version/restore',
    { preHandler: loggedIn },
    async (request, reply) => {
      const tripId = ownedTripId(request);
      if (tripId === null) return tripNotFound(reply);
      const requested = /^[1-9]\d*$/.test(request.params.version) ? Number(request.params.version) : null;
      const restored = requested === null ? null : deps.store.restore(tripId, requested);
      if (!restored) {
        return reply.code(404).send({ code: PLAN_VERSION_NOT_FOUND, message: 'That version of the Plan does not exist.' });
      }
      // 200 when the newest version was restored and nothing was made; 201 when a new version was saved.
      return reply.code(restored.version === requested ? 200 : 201).send(restored);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/trips/:id/plan',
    { preHandler: loggedIn },
    async (request, reply) => {
      const result = await deps.plans.generate(request.accountId ?? '', request.params.id);
      if (result.ok) return reply.code(201).send(result.plan);
      switch (result.error) {
        case 'not-found':
          return tripNotFound(reply);
        case 'limit-reached':
          return reply.code(429).send({
            code: PLAN_LIMIT_REACHED,
            message: `You have reached today's limit of ${result.limit} Plan generations. It resets at ${resetTimeText(result.resetsAt)}.`,
            limit: result.limit,
            resetsAt: result.resetsAt.toISOString(),
          });
        case 'trip-changed':
          return reply.code(409).send({
            code: TRIP_CHANGED,
            message: 'The Trip was changed while its Plan was being generated, so the Plan was not saved. Try again.',
          });
        case 'ai-unavailable':
          request.log.warn({ tripId: request.params.id, reason: result.reason }, 'Plan generation failed');
          return reply.code(503).send({ code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE });
      }
    },
  );
}
