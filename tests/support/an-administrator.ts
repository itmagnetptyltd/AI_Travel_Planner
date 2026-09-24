import type { FastifyInstance } from 'fastify';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';
import { seedAdministrator } from '../../src/server/admin/seed-administrator';
import type { TrvDatabase } from '../../src/server/db/client';
import {
  aRegisteredTraveler,
  logIn,
  sessionCookieFrom,
  tokenFromLatestEmail,
  VALID_PASSWORD,
  type TravelerDetails,
} from './a-traveler';
import type { CapturingEmailService } from './capturing-email-service';
import { aFixedClock } from './fixed-clock';

export const ADMIN_EMAIL = 'admin@example.com';

/** Seeds an Administrator straight into the database, as the installation step does. */
export async function aSeededAdministrator(db: TrvDatabase, email = ADMIN_EMAIL): Promise<TravelerDetails> {
  const result = await seedAdministrator(
    { db, clock: aFixedClock(), breachedPasswords: createListBreachedPasswordChecker([]) },
    { email, password: VALID_PASSWORD },
  );
  if (!result.ok) {
    throw new Error(`Seeding ${email} failed: ${result.error}`);
  }
  return { email, password: VALID_PASSWORD };
}

export async function aLoggedInAdministrator(
  app: FastifyInstance,
  db: TrvDatabase,
  email = ADMIN_EMAIL,
): Promise<Record<string, string>> {
  const administrator = await aSeededAdministrator(db, email);
  return sessionCookieFrom(await logIn(app, administrator));
}

/** Registers a Traveler and confirms their email address from the captured link. */
export async function aConfirmedTraveler(
  app: FastifyInstance,
  email: CapturingEmailService,
  overrides: Partial<TravelerDetails> = {},
): Promise<TravelerDetails> {
  const traveler = await aRegisteredTraveler(app, overrides);
  const token = tokenFromLatestEmail(email, traveler.email);
  await app.inject({ method: 'POST', url: '/api/email-confirmations', payload: { token } });
  return traveler;
}

export async function accountIdOf(
  app: FastifyInstance,
  adminCookies: Record<string, string>,
  address: string,
): Promise<string> {
  const response = await app.inject({ method: 'GET', url: '/api/admin/accounts', cookies: adminCookies });
  const accounts = (response.json() as { accounts: { id: string; email: string }[] }).accounts;
  const account = accounts.find((a) => a.email === address);
  if (!account) {
    throw new Error(`No account listed for ${address}`);
  }
  return account.id;
}
