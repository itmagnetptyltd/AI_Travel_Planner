import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { describe, expect, test } from 'vitest';
import { createAccountService } from '../../src/server/accounts/account-service';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';
import { requireTraveler } from '../../src/server/accounts/require-traveler';
import { createSessionService } from '../../src/server/accounts/session-service';
import { requireAdministrator } from '../../src/server/admin/require-administrator';
import { seedAdministrator } from '../../src/server/admin/seed-administrator';
import type { TrvDatabase } from '../../src/server/db/client';
import { ADMIN_FUNCTIONS } from '../../src/shared/admin-functions';
import { aTestDatabase } from '../support/build-test-app';
import { aCapturingEmailService } from '../support/capturing-email-service';
import { aFixedClock } from '../support/fixed-clock';
import { VALID_PASSWORD } from '../support/a-traveler';

const clock = aFixedClock();
const noBreaches = createListBreachedPasswordChecker([]);

function servicesFor(db: TrvDatabase) {
  const accounts = createAccountService({
    db,
    clock,
    email: aCapturingEmailService(),
    breachedPasswords: noBreaches,
    appBaseUrl: 'http://trv.test',
  });
  return { accounts, sessions: createSessionService(db, clock) };
}

async function aGuardedApp(db: TrvDatabase) {
  const { accounts, sessions } = servicesFor(db);
  const app = Fastify();
  await app.register(cookie);
  app.get('/admin-only', { preHandler: [requireTraveler(sessions), requireAdministrator(accounts)] }, async () => ({
    reached: true,
  }));
  return { app, accounts, sessions };
}

describe('requireAdministrator', () => {
  // @covers REQ-TRV-068@v2
  test('a logged-in Traveler who is not an Administrator is refused with 403', async () => {
    const db = aTestDatabase();
    const { app, accounts, sessions } = await aGuardedApp(db);
    const registered = await accounts.register({ email: 'traveler@example.com', password: VALID_PASSWORD });
    const sessionId = await sessions.start(registered.ok ? registered.accountId : 'none');

    const response = await app.inject({ method: 'GET', url: '/admin-only', cookies: { trv_session: sessionId } });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  // @covers REQ-TRV-068@v2
  test('an Administrator is let through', async () => {
    const db = aTestDatabase();
    const { app, sessions } = await aGuardedApp(db);
    const seeded = await seedAdministrator(
      { db, clock, breachedPasswords: noBreaches },
      { email: 'admin@example.com', password: VALID_PASSWORD },
    );
    const sessionId = await sessions.start(seeded.ok ? seeded.accountId : 'none');

    const response = await app.inject({ method: 'GET', url: '/admin-only', cookies: { trv_session: sessionId } });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe('installation seed step', () => {
  // @covers REQ-TRV-068@v2
  test('seeding admin@example.com creates a confirmed Administrator who can log in', async () => {
    const db = aTestDatabase();
    const { accounts } = servicesFor(db);

    const seeded = await seedAdministrator(
      { db, clock, breachedPasswords: noBreaches },
      { email: 'admin@example.com', password: VALID_PASSWORD },
    );
    const login = await accounts.authenticate({ email: 'admin@example.com', password: VALID_PASSWORD });

    expect(seeded.ok).toBe(true);
    expect(login.ok).toBe(true);
    expect(await accounts.findAccount(login.ok ? login.accountId : 'none')).toMatchObject({
      role: 'administrator',
      isEmailConfirmed: true,
    });
  });

  // @covers REQ-TRV-068@v2
  test('seeding an email that already has an account is refused', async () => {
    const db = aTestDatabase();
    const deps = { db, clock, breachedPasswords: noBreaches };
    await seedAdministrator(deps, { email: 'admin@example.com', password: VALID_PASSWORD });

    const second = await seedAdministrator(deps, { email: 'admin@example.com', password: VALID_PASSWORD });

    expect(second).toEqual({ ok: false, error: 'email-already-registered' });
  });

  // @covers REQ-TRV-068@v2
  test('seeding with a password shorter than 12 characters is refused', async () => {
    const db = aTestDatabase();

    const result = await seedAdministrator(
      { db, clock, breachedPasswords: noBreaches },
      { email: 'admin@example.com', password: 'short-pass' }, // itm-sdlc:allow-secret - synthetic test password
    );

    expect(result).toMatchObject({ ok: false, error: 'invalid-password' });
  });
});

describe('admin functions', () => {
  // @covers REQ-TRV-068@v2
  test('the admin functions are exactly users, Destinations, feedback, notification settings and AI usage limits', () => {
    expect(ADMIN_FUNCTIONS.map((f) => f.label)).toEqual([
      'Users',
      'Destinations',
      'Feedback',
      'Notification settings',
      'AI usage limits',
    ]);
  });
});
