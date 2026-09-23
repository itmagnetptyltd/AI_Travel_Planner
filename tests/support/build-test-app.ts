import type { FastifyInstance } from 'fastify';
import { onTestFinished } from 'vitest';
import { buildApp } from '../../src/server/app';
import { openDatabase, type TrvDatabase } from '../../src/server/db/client';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';
import { aCapturingEmailService, type CapturingEmailService } from './capturing-email-service';
import { aFixedClock, type FixedClock } from './fixed-clock';

export const BREACHED_PASSWORD = 'password1234567890';
export const APP_BASE_URL = 'http://trv.test';

export interface TestApp {
  readonly app: FastifyInstance;
  readonly db: TrvDatabase;
  readonly clock: FixedClock;
  readonly email: CapturingEmailService;
}

/** A fresh app over a fresh, fully migrated in-memory SQLite database. */
export async function buildTestApp(): Promise<TestApp> {
  const { db, close } = openDatabase(':memory:');
  const clock = aFixedClock();
  const email = aCapturingEmailService();
  const app = await buildApp({
    db,
    clock,
    email,
    breachedPasswords: createListBreachedPasswordChecker([BREACHED_PASSWORD]),
    appBaseUrl: APP_BASE_URL,
    cookieSecure: false,
    authRateLimitPerMinute: 1000,
  });
  onTestFinished(async () => {
    await app.close();
    close();
  });
  return { app, db, clock, email };
}

export function aTestDatabase(): TrvDatabase {
  const { db, close } = openDatabase(':memory:');
  onTestFinished(() => close());
  return db;
}
