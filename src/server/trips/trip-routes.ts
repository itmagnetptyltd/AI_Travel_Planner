import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AccountService } from '../accounts/account-service';
import { requireConfirmedEmail, requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { parseBody } from '../http/validation';
import { PLAN_CHANGE_NEEDS_CONFIRMATION, type WarnedPlanEffect } from '../../shared/plan-schemas';
import { tripChangeRequestSchema, tripInputSchema } from '../../shared/trip-schemas';
import { replyToRefusal } from '../plans/plan-refusals';
import type { ChangeResult, TripChangeService } from './trip-change-service';
import type { TripResult, TripService } from './trip-service';

type IdParams = { readonly id: string };

/**
 * The owner of a Trip is always the logged-in account, never anything in the request.
 * A Trip that is absent, deleted or someone else's gets the same 404, so a caller
 * cannot learn which Trip identifiers exist (REQ-TRV-007).
 */
export async function tripRoutes(
  app: FastifyInstance,
  deps: {
    readonly accounts: AccountService;
    readonly sessions: SessionService;
    readonly trips: TripService;
    readonly tripChanges: TripChangeService;
  },
): Promise<void> {
  const { trips } = deps;
  const loggedIn = requireTraveler(deps.sessions);
  const confirmed = requireConfirmedEmail(deps.accounts);
  const ownerOf = (request: { accountId?: string }) => request.accountId ?? '';

  app.get('/api/trips', { preHandler: loggedIn }, async (request) => ({ trips: trips.listForOwner(ownerOf(request)) }));

  app.post('/api/trips', { preHandler: [loggedIn, confirmed] }, async (request, reply) => {
    const body = await parseBody(tripInputSchema, request.body, reply);
    if (!body.ok) return;
    return replyWith(reply, trips.create(ownerOf(request), body.value), 201);
  });

  app.get<{ Params: IdParams }>('/api/trips/:id', { preHandler: loggedIn }, async (request, reply) => {
    const trip = trips.getForOwner(ownerOf(request), request.params.id);
    return trip ?? tripNotFound(reply);
  });

  app.patch<{ Params: IdParams }>('/api/trips/:id', { preHandler: loggedIn }, async (request, reply) => {
    const body = await parseBody(tripChangeRequestSchema, request.body, reply);
    if (!body.ok) return;
    const { confirmPlanChange, ...change } = body.value;
    const result = await deps.tripChanges.change(ownerOf(request), request.params.id, change, { confirmPlanChange });
    return replyToChange(request, reply, result);
  });

  app.delete<{ Params: IdParams }>('/api/trips/:id', { preHandler: loggedIn }, async (request, reply) =>
    trips.softDelete(ownerOf(request), request.params.id) ? reply.code(204).send() : tripNotFound(reply),
  );
}

function tripNotFound(reply: FastifyReply) {
  return reply.code(404).send({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
}

function planChangeMessage(effect: WarnedPlanEffect): string {
  return effect.kind === 'regenerate'
    ? "Changing the Destination replaces this Trip's Plan with a new one. Your current Plan stays as an earlier version you can restore."
    : `Shortening the Trip drops ${effect.droppedDays.length === 1 ? 'Day' : 'Days'} ${effect.droppedDays.join(', ')} from its Plan. Your current Plan stays as an earlier version you can restore.`;
}

function replyToChange(request: FastifyRequest, reply: FastifyReply, result: ChangeResult) {
  if (result.ok) return reply.code(200).send(result.trip);
  if (result.error === 'invalid') return replyWith(reply, result, 200);
  if (result.error === 'needs-confirmation') {
    return reply
      .code(409)
      .send({ code: PLAN_CHANGE_NEEDS_CONFIRMATION, message: planChangeMessage(result.effect), effect: result.effect });
  }
  return replyToRefusal(request, reply, result, 'Trip change');
}

function replyWith(reply: FastifyReply, result: TripResult, successStatus: number) {
  if (result.ok) {
    return reply.code(successStatus).send(result.trip);
  }
  if (result.error === 'not-found') {
    return tripNotFound(reply);
  }
  return reply
    .code(400)
    .send({ code: 'VALIDATION_FAILED', field: result.field, message: `${result.field} is not valid.` });
}
