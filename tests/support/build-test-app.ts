import type { FastifyInstance } from 'fastify';
import { onTestFinished } from 'vitest';
import { buildApp } from '../../src/server/app';
import { openDatabase, type TrvDatabase } from '../../src/server/db/client';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';
import type { PlanGenerationSettings } from '../../src/server/plans/plan-service';
import { anAiDouble, type AiDouble } from './an-ai-double';
import { aCapturingEmailService, type CapturingEmailService } from './capturing-email-service';
import { aFixedClock, type FixedClock } from './fixed-clock';

export const BREACHED_PASSWORD = 'password1234567890'; // itm-sdlc:allow-secret - synthetic test password
export const APP_BASE_URL = 'http://trv.test';

export interface TestApp {
  readonly app: FastifyInstance;
  readonly db: TrvDatabase;
  readonly clock: FixedClock;
  readonly email: CapturingEmailService;
  readonly ai: AiDouble;
}

export const TEST_PLAN_SETTINGS: PlanGenerationSettings = {
  timeoutMs: 1_000,
  destinationTextMaxChars: 2_000,
  maxOutputTokens: 8_000,
  inputCostMicroUsdPerMTok: 3_000_000,
  outputCostMicroUsdPerMTok: 15_000_000,
};

/** A fresh app over a fresh, fully migrated in-memory SQLite database. */
export async function buildTestApp(
  options: {
    readonly now?: Date;
    readonly planSettings?: Partial<PlanGenerationSettings>;
    /** Runs against the migrated database before the application starts. */
    readonly seed?: (db: TrvDatabase) => void;
  } = {},
): Promise<TestApp> {
  const { db, close } = openDatabase(':memory:');
  const clock = aFixedClock(options.now);
  const email = aCapturingEmailService();
  const ai = anAiDouble();
  options.seed?.(db);
  const app = await buildApp({
    db,
    clock,
    email,
    ai,
    planSettings: { ...TEST_PLAN_SETTINGS, ...options.planSettings },
    breachedPasswords: createListBreachedPasswordChecker([BREACHED_PASSWORD]),
    appBaseUrl: APP_BASE_URL,
    cookieSecure: false,
    authRateLimitPerMinute: 1000,
  });
  onTestFinished(async () => {
    await app.close();
    close();
  });
  return { app, db, clock, email, ai };
}

export function aTestDatabase(): TrvDatabase {
  const { db, close } = openDatabase(':memory:');
  onTestFinished(() => close());
  return db;
}
