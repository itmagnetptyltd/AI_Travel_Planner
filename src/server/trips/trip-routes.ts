import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AccountService } from '../accounts/account-service';
import { requireConfirmedEmail, requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { parseBody } from '../http/validation';
import { tripInputSchema, tripUpdateSchema } from '../../shared/trip-schemas';
import type { TripResult, TripService } from './trip-service';

type IdParams = { readonly id: string };

/**
 * The owner of a Trip is always the logged-in account, never anything in the request.
 * A Trip that is absent, deleted or someone else's gets the same 404, so a caller
 * cannot learn which Trip identifiers exist (REQ-TRV-007).
 */
export async function tripRoutes(
  app: FastifyInstance,
  deps: { readonly accounts: AccountService; readonly sessions: SessionService; readonly trips: TripService },
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
    const body = await parseBody(tripUpdateSchema, request.body, reply);
    if (!body.ok) return;
    return replyWith(reply, trips.update(ownerOf(request), request.params.id, body.value), 200);
  });

  app.delete<{ Params: IdParams }>('/api/trips/:id', { preHandler: loggedIn }, async (request, reply) =>
    trips.softDelete(ownerOf(request), request.params.id) ? reply.code(204).send() : tripNotFound(reply),
  );
}

function tripNotFound(reply: FastifyReply) {
  return reply.code(404).send({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
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
