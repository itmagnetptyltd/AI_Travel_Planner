import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { parseBody } from '../http/validation';
import { PLAN_NOT_FOUND, PLAN_VERSION_NOT_FOUND } from '../../shared/plan-schemas';
import { budgetOf } from '../../shared/trip-budget';
import type { TripService } from '../trips/trip-service';
import { replyToRefusal, tripNotFound } from './plan-refusals';
import type { PlanRegenerationService } from './plan-regeneration-service';
import type { PlanService } from './plan-service';
import type { PlanStore } from './plan-store';

/** A request that may replace Activities the Traveler changed by hand carries their agreement to lose them. */
export const regenerationRequestSchema = z.object({ confirmReplaceEdits: z.boolean().optional() }).strict();

type IdParams = { readonly id: string };

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
    readonly regeneration: PlanRegenerationService;
    readonly trips: TripService;
    readonly store: PlanStore;
  },
): Promise<void> {
  const loggedIn = requireTraveler(deps.sessions);
  const ownerOf = (request: { accountId?: string }) => request.accountId ?? '';
  const ownedTripId = (request: { accountId?: string; params: IdParams }): string | null =>
    deps.trips.getForOwner(ownerOf(request), request.params.id) ? request.params.id : null;

  app.get<{ Params: IdParams }>('/api/trips/:id/plan', { preHandler: loggedIn }, async (request, reply) => {
    const tripId = ownedTripId(request);
    if (tripId === null) return tripNotFound(reply);
    return deps.store.current(tripId) ?? reply.code(404).send({ code: PLAN_NOT_FOUND, message: 'This Trip has no Plan yet.' });
  });

  /** What the current Plan is estimated to cost, against the Trip's budget. Worked out from the saved Plan, so it never asks the AI. */
  app.get<{ Params: IdParams }>('/api/trips/:id/budget', { preHandler: loggedIn }, async (request, reply) => {
    const trip = deps.trips.getForOwner(ownerOf(request), request.params.id);
    if (!trip) return tripNotFound(reply);
    const plan = deps.store.current(trip.id);
    return plan ? budgetOf(plan, trip) : reply.code(404).send({ code: PLAN_NOT_FOUND, message: 'This Trip has no Plan yet.' });
  });

  app.get<{ Params: IdParams }>('/api/trips/:id/plan/versions', { preHandler: loggedIn }, async (request, reply) => {
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

  app.post<{ Params: IdParams }>('/api/trips/:id/plan', { preHandler: loggedIn }, async (request, reply) => {
    const body = await parseBody(regenerationRequestSchema, request.body, reply);
    if (!body.ok) return;
    const result = await deps.plans.generate(ownerOf(request), request.params.id, body.value);
    return result.ok ? reply.code(201).send(result.plan) : replyToRefusal(request, reply, result, 'Plan generation');
  });

  app.post<{ Params: IdParams & { day: string } }>(
    '/api/trips/:id/plan/days/:day/regenerate',
    { preHandler: loggedIn },
    async (request, reply) => {
      const body = await parseBody(regenerationRequestSchema, request.body, reply);
      if (!body.ok) return;
      const dayNumber = /^[1-9]\d*$/.test(request.params.day) ? Number(request.params.day) : 0;
      const result = await deps.regeneration.regenerateDay(ownerOf(request), request.params.id, dayNumber, body.value);
      return result.ok ? reply.code(201).send(result.plan) : replyToRefusal(request, reply, result, 'Day regeneration');
    },
  );

  app.post<{ Params: IdParams & { activityId: string } }>(
    '/api/trips/:id/plan/activities/:activityId/suggestion',
    { preHandler: loggedIn },
    async (request, reply) => {
      const result = await deps.regeneration.suggestReplacement(ownerOf(request), request.params.id, request.params.activityId);
      return result.ok ? reply.code(200).send(result.activity) : replyToRefusal(request, reply, result, 'Activity suggestion');
    },
  );
}
