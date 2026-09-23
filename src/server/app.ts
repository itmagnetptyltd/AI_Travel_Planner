import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { Clock } from './clock';
import type { TrvDatabase } from './db/client';
import type { EmailService } from './email/email-service';
import type { BreachedPasswordChecker } from './accounts/breached-password-checker';
import { createAccountService } from './accounts/account-service';
import { createSessionService } from './accounts/session-service';
import { accountRoutes } from './accounts/account-routes';
import { profileRoutes } from './accounts/profile-routes';
import { tripRoutes } from './trips/trip-routes';

export interface AppDeps {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly email: EmailService;
  readonly breachedPasswords: BreachedPasswordChecker;
  readonly appBaseUrl: string;
  readonly cookieSecure: boolean;
  readonly authRateLimitPerMinute: number;
  /** Directory of the built web app. Omitted in API tests. */
  readonly webRoot?: string;
  readonly logger?: boolean;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
  });
  await app.register(rateLimit, { global: false });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled error');
    await reply.code(500).send({ code: 'INTERNAL_ERROR', correlationId: request.id });
  });

  const accounts = createAccountService({
    db: deps.db,
    clock: deps.clock,
    email: deps.email,
    breachedPasswords: deps.breachedPasswords,
    appBaseUrl: deps.appBaseUrl,
  });
  const sessions = createSessionService(deps.db, deps.clock);

  app.get('/api/health', async () => ({ status: 'ok' }));
  await accountRoutes(app, {
    accounts,
    sessions,
    cookieSecure: deps.cookieSecure,
    authRateLimitPerMinute: deps.authRateLimitPerMinute,
  });
  await profileRoutes(app, { accounts, sessions });
  await tripRoutes(app, { accounts, sessions });

  if (deps.webRoot && existsSync(deps.webRoot)) {
    await serveWebApp(app, deps.webRoot);
  }
  return app;
}

/** Serves the built single-page app; unknown non-API paths get index.html so client routes work. */
async function serveWebApp(app: FastifyInstance, webRoot: string): Promise<void> {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ code: 'NOT_FOUND' });
  });
}
