import type { FastifyInstance } from 'fastify';
import { profileUpdateSchema } from '../../shared/profile-schemas';
import { parseBody } from '../http/validation';
import type { AccountService } from './account-service';
import { requireTraveler } from './require-traveler';
import type { SessionService } from './session-service';

export async function profileRoutes(
  app: FastifyInstance,
  deps: { readonly accounts: AccountService; readonly sessions: SessionService },
): Promise<void> {
  const preHandler = requireTraveler(deps.sessions);

  app.get('/api/profile', { preHandler }, async (request, reply) => {
    const profile = request.accountId ? await deps.accounts.getProfile(request.accountId) : null;
    return profile ?? reply.code(401).send({ code: 'NOT_LOGGED_IN', message: 'Log in to continue.' });
  });

  app.patch('/api/profile', { preHandler }, async (request, reply) => {
    const body = await parseBody(profileUpdateSchema, request.body, reply);
    if (!body.ok || !request.accountId) return;
    return deps.accounts.updateProfile(request.accountId, stripUndefined(body.value));
  });
}

function stripUndefined<T extends object>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
