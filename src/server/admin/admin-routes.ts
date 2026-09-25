import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AccountService } from '../accounts/account-service';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import type { DestinationService } from '../destinations/destination-service';
import { parseBody } from '../http/validation';
import { ADMIN_FUNCTIONS, ROLES } from '../../shared/admin-functions';
import { destinationInputSchema, destinationUpdateSchema } from '../../shared/destination-schemas';
import { accountActions, type AdminAccountService } from './admin-account-service';
import { requireAdministrator } from './require-administrator';

const ADMIN_ROUTE_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type AdminRouteMethod = (typeof ADMIN_ROUTE_METHODS)[number];
export interface AdminRoute {
  readonly method: AdminRouteMethod;
  readonly url: string;
}

const isAdminRouteMethod = (method: string): method is AdminRouteMethod =>
  (ADMIN_ROUTE_METHODS as readonly string[]).includes(method);

export interface AdminRouteDeps {
  readonly accounts: AccountService;
  readonly sessions: SessionService;
  readonly adminAccounts: AdminAccountService;
  readonly destinations: DestinationService;
  /** Filled with every route registered here, so a test can prove each one is guarded. */
  readonly registeredRoutes: AdminRoute[];
}

type IdParams = { readonly id: string };

const roleChangeSchema = z.object({ role: z.enum(ROLES), confirm: z.literal(true) }).strict();

const ROLE_CHANGE_REFUSALS = {
  'not-found': { status: 404, code: 'NOT_FOUND', message: 'No such account.' },
  'email-not-confirmed': {
    status: 409,
    code: 'EMAIL_NOT_CONFIRMED',
    message: 'Only a user whose email address is confirmed can be made an Administrator.',
  },
  'last-administrator': {
    status: 409,
    code: 'LAST_ADMINISTRATOR',
    message: 'The last Administrator cannot be removed.',
  },
} as const;

const notFound = (reply: FastifyReply, what: string) => reply.code(404).send({ code: 'NOT_FOUND', message: `No such ${what}.` });

/**
 * Every /api/admin route lives in this one scope. The two hooks below apply to all of
 * them, so a route added here later is protected before anyone remembers to think about it.
 */
export async function adminRoutes(app: FastifyInstance, deps: AdminRouteDeps): Promise<void> {
  await app.register(async (scope) => {
    scope.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      methods.filter(isAdminRouteMethod).forEach((method) => deps.registeredRoutes.push({ method, url: route.url }));
    });
    scope.addHook('preHandler', requireTraveler(deps.sessions));
    scope.addHook('preHandler', requireAdministrator(deps.accounts));

    scope.get('/api/admin/dashboard', async () => ({ functions: ADMIN_FUNCTIONS }));
    registerAccountRoutes(scope, deps);
    registerDestinationRoutes(scope, deps);
  });
}

function registerAccountRoutes(scope: FastifyInstance, deps: AdminRouteDeps): void {
  const { adminAccounts } = deps;

  scope.get('/api/admin/accounts', async () => ({ accounts: adminAccounts.listAccounts() }));

  scope.get<{ Params: IdParams }>('/api/admin/accounts/:id', async (request, reply) => {
    const account = adminAccounts.getAccount(request.params.id);
    return account ? { account, actions: accountActions(account) } : notFound(reply, 'account');
  });

  const setDisabled = (isDisabled: boolean) =>
    async (request: { params: IdParams; accountId?: string }, reply: FastifyReply) => {
      const actorId = request.accountId ?? '';
      if (!adminAccounts.setDisabled(actorId, request.params.id, isDisabled)) {
        return notFound(reply, 'account');
      }
      return { account: adminAccounts.getAccount(request.params.id) };
    };
  scope.post<{ Params: IdParams }>('/api/admin/accounts/:id/disable', setDisabled(true));
  scope.post<{ Params: IdParams }>('/api/admin/accounts/:id/enable', setDisabled(false));

  scope.put<{ Params: IdParams }>('/api/admin/accounts/:id/role', async (request, reply) => {
    const body = await parseBody(roleChangeSchema, request.body, reply);
    if (!body.ok) return;
    const result = adminAccounts.changeRole(request.accountId ?? '', request.params.id, body.value.role);
    if (result.ok) {
      return { account: adminAccounts.getAccount(request.params.id) };
    }
    const { status, code, message } = ROLE_CHANGE_REFUSALS[result.error];
    return reply.code(status).send({ code, message });
  });

  // Administrators may not edit a Traveler's profile (REQ-TRV-071). This route exists
  // only so that the attempt has a definite answer; it never changes anything.
  scope.patch('/api/admin/accounts/:id/profile', async (_request, reply) =>
    reply
      .code(403)
      .send({ code: 'PROFILE_EDIT_NOT_ALLOWED', message: "Administrators cannot change a Traveler's profile." }),
  );
}

function registerDestinationRoutes(scope: FastifyInstance, deps: AdminRouteDeps): void {
  const { destinations } = deps;

  scope.get('/api/admin/destinations', async () => ({ destinations: destinations.listForAdmin() }));

  scope.post('/api/admin/destinations', async (request, reply) => {
    const body = await parseBody(destinationInputSchema, request.body, reply);
    if (!body.ok) return;
    return reply.code(201).send(destinations.add(body.value));
  });

  scope.patch<{ Params: IdParams }>('/api/admin/destinations/:id', async (request, reply) => {
    const body = await parseBody(destinationUpdateSchema, request.body, reply);
    if (!body.ok) return;
    return destinations.edit(request.params.id, body.value) ?? notFound(reply, 'Destination');
  });

  scope.post<{ Params: IdParams }>('/api/admin/destinations/:id/disable', async (request, reply) =>
    destinations.setDisabled(request.params.id, true) ?? notFound(reply, 'Destination'),
  );
  scope.post<{ Params: IdParams }>('/api/admin/destinations/:id/enable', async (request, reply) =>
    destinations.setDisabled(request.params.id, false) ?? notFound(reply, 'Destination'),
  );

  scope.delete<{ Params: IdParams }>('/api/admin/destinations/:id', async (request, reply) => {
    const removal = destinations.remove(request.params.id);
    if (removal === 'in-use') {
      return reply
        .code(409)
        .send({ code: 'DESTINATION_IN_USE', message: 'This Destination is used by a Trip and cannot be removed.' });
    }
    return removal === 'removed' ? reply.code(204).send() : notFound(reply, 'Destination');
  });
}
