import type { FastifyInstance } from 'fastify';
import type { AccountService } from '../accounts/account-service';
import { requireConfirmedEmail, requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';

/**
 * Slice 1 carries only the guards on the Trip surface. The Trip list and Trip
 * creation themselves arrive in slice 3 (REQ-TRV-011, REQ-TRV-016).
 */
export async function tripRoutes(
  app: FastifyInstance,
  deps: { readonly accounts: AccountService; readonly sessions: SessionService },
): Promise<void> {
  const loggedIn = requireTraveler(deps.sessions);
  const confirmed = requireConfirmedEmail(deps.accounts);

  app.get('/api/trips', { preHandler: loggedIn }, async () => ({ trips: [] }));

  app.post('/api/trips', { preHandler: [loggedIn, confirmed] }, async (_request, reply) =>
    reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Trip creation arrives in a later release.' }),
  );
}
