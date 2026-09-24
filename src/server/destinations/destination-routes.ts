import type { FastifyInstance } from 'fastify';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { parseQuery } from '../http/validation';
import { destinationSearchSchema } from '../../shared/destination-schemas';
import type { DestinationService } from './destination-service';

/** What a logged-in Traveler may see of the Destination list: enabled Destinations only. */
export async function destinationRoutes(
  app: FastifyInstance,
  deps: { readonly sessions: SessionService; readonly destinations: DestinationService },
): Promise<void> {
  const preHandler = requireTraveler(deps.sessions);

  app.get('/api/destinations', { preHandler }, async (request, reply) => {
    const query = await parseQuery(destinationSearchSchema, request.query, reply);
    if (!query.ok) return;
    return { destinations: query.value.q === '' ? [] : deps.destinations.search(query.value.q) };
  });

  app.get<{ Params: { readonly id: string } }>('/api/destinations/:id', { preHandler }, async (request, reply) => {
    const destination = deps.destinations.getForTraveler(request.params.id);
    return destination ?? reply.code(404).send({ code: 'NOT_FOUND', message: 'No such Destination.' });
  });
}
