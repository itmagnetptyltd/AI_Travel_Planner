import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { Clock } from './clock';
import type { TrvDatabase } from './db/client';
import type { AiService } from './ai/ai-service';
import type { EmailService } from './email/email-service';
import type { BreachedPasswordChecker } from './accounts/breached-password-checker';
import { createAccountService } from './accounts/account-service';
import { createSessionService } from './accounts/session-service';
import { accountRoutes } from './accounts/account-routes';
import { profileRoutes } from './accounts/profile-routes';
import { tripRoutes } from './trips/trip-routes';
import { planRoutes } from './plans/plan-routes';
import { planEditRoutes } from './plans/plan-edit-routes';
import { createPlanEditorService } from './plans/plan-editor-service';
import { createPlanRegenerationService } from './plans/plan-regeneration-service';
import { createAdminAccountService } from './admin/admin-account-service';
import { adminRoutes, type AdminRoute } from './admin/admin-routes';
import { createDestinationService } from './destinations/destination-service';
import { destinationRoutes } from './destinations/destination-routes';
import { createTripService } from './trips/trip-service';
import { createTripChangeService } from './trips/trip-change-service';
import { createAiRecordService, schedulePurge, scheduleTextPurge } from './plans/ai-record-service';
import { createChatStore } from './chat/chat-store';
import { createChatService } from './chat/chat-service';
import { chatRoutes } from './chat/chat-routes';
import { createAiUsageLimitService } from './plans/ai-usage-limit-service';
import { createPlanService, type PlanGenerationSettings } from './plans/plan-service';
import { createPlanStore } from './plans/plan-store';

const AI_TEXT_PURGE_INTERVAL_MS = 60 * 60 * 1000;
const TRIP_PURGE_INTERVAL_MS = 60 * 60 * 1000;

export interface AppDeps {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly email: EmailService;
  readonly ai: AiService;
  readonly planSettings: PlanGenerationSettings;
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
  const destinations = createDestinationService({ db: deps.db, clock: deps.clock });
  const trips = createTripService({ db: deps.db, clock: deps.clock });
  const aiLimits = createAiUsageLimitService({ db: deps.db, clock: deps.clock });
  const aiRecords = createAiRecordService({ db: deps.db, clock: deps.clock });
  const planStore = createPlanStore({ db: deps.db, clock: deps.clock });
  const aiDeps = {
    db: deps.db,
    clock: deps.clock,
    ai: deps.ai,
    trips,
    limits: aiLimits,
    store: planStore,
    settings: deps.planSettings,
  };
  const plans = createPlanService(aiDeps);
  const planRegeneration = createPlanRegenerationService(aiDeps);
  const tripChanges = createTripChangeService({ db: deps.db, trips, store: planStore, plans });
  const planEditor = createPlanEditorService({ trips, store: planStore });
  const chatStore = createChatStore({ db: deps.db, clock: deps.clock });
  const chat = createChatService({ ...aiDeps, chat: chatStore });
  const adminAccounts = createAdminAccountService({ db: deps.db, clock: deps.clock, sessions });
  const stopPurging = scheduleTextPurge(aiRecords, AI_TEXT_PURGE_INTERVAL_MS, (error) =>
    app.log.error({ err: error }, 'Clearing expired AI text failed'),
  );
  const stopPurgingTrips = schedulePurge(() => trips.purgeExpired(), TRIP_PURGE_INTERVAL_MS, (error) =>
    app.log.error({ err: error }, 'Removing expired deleted Trips failed'),
  );
  app.addHook('onClose', async () => {
    stopPurging();
    stopPurgingTrips();
  });
  const registeredAdminRoutes: AdminRoute[] = [];
  app.decorate('adminRoutes', registeredAdminRoutes);

  app.get('/api/health', async () => ({ status: 'ok' }));
  await accountRoutes(app, {
    accounts,
    sessions,
    cookieSecure: deps.cookieSecure,
    authRateLimitPerMinute: deps.authRateLimitPerMinute,
  });
  await profileRoutes(app, { accounts, sessions });
  await tripRoutes(app, { accounts, sessions, trips, tripChanges });
  await planRoutes(app, { sessions, plans, regeneration: planRegeneration, trips, store: planStore });
  await planEditRoutes(app, { sessions, editor: planEditor });
  await chatRoutes(app, { sessions, chat });
  await destinationRoutes(app, { sessions, destinations });
  await adminRoutes(app, { accounts, sessions, adminAccounts, destinations, aiLimits, aiRecords, registeredRoutes: registeredAdminRoutes });

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

declare module 'fastify' {
  interface FastifyInstance {
    /** Every /api/admin route, as registered. Read by the test that proves each one is guarded. */
    adminRoutes: readonly AdminRoute[];
  }
}
