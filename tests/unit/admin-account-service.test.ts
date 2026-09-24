import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { createAccountService, type AccountService } from '../../src/server/accounts/account-service';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';
import { createSessionService } from '../../src/server/accounts/session-service';
import { accountActions, createAdminAccountService } from '../../src/server/admin/admin-account-service';
import { seedAdministrator } from '../../src/server/admin/seed-administrator';
import type { TrvDatabase } from '../../src/server/db/client';
import { accounts as accountsTable, auditLog } from '../../src/server/db/schema';
import { aTestDatabase } from '../support/build-test-app';
import { aCapturingEmailService } from '../support/capturing-email-service';
import { aFixedClock } from '../support/fixed-clock';
import { VALID_PASSWORD } from '../support/a-traveler';

const clock = aFixedClock();
const noBreaches = createListBreachedPasswordChecker([]);

function aWorld() {
  const db = aTestDatabase();
  const accounts = createAccountService({
    db,
    clock,
    email: aCapturingEmailService(),
    breachedPasswords: noBreaches,
    appBaseUrl: 'http://trv.test',
  });
  const sessions = createSessionService(db, clock);
  const admin = createAdminAccountService({ db, clock, sessions });
  return { db, accounts, sessions, admin };
}

async function anAdministratorId(db: TrvDatabase, email = 'admin@example.com'): Promise<string> {
  const seeded = await seedAdministrator({ db, clock, breachedPasswords: noBreaches }, { email, password: VALID_PASSWORD });
  if (!seeded.ok) throw new Error(`seed failed: ${seeded.error}`);
  return seeded.accountId;
}

async function aTravelerId(accounts: AccountService, db: TrvDatabase, options: { confirmed: boolean }): Promise<string> {
  const registered = await accounts.register({ email: 'traveler@example.com', password: VALID_PASSWORD });
  if (!registered.ok) throw new Error('registration failed');
  if (options.confirmed) {
    db.update(accountsTable).set({ emailConfirmedAt: clock.now() }).where(eq(accountsTable.id, registered.accountId)).run();
  }
  return registered.accountId;
}

const auditEntries = (db: TrvDatabase) => db.select().from(auditLog).all();

describe('user list', () => {
  // @covers REQ-TRV-071@v2
  test('the user list shows every Traveler by email address', async () => {
    const { accounts, admin } = aWorld();
    await accounts.register({ email: 'first@example.com', password: VALID_PASSWORD });
    await accounts.register({ email: 'second@example.com', password: VALID_PASSWORD });

    const listed = admin.listAccounts().map((a) => a.email);

    expect(listed).toEqual(expect.arrayContaining(['first@example.com', 'second@example.com']));
  });
});

describe('changing roles', () => {
  // @covers REQ-TRV-068@v2
  test('promoting a confirmed Traveler makes them an Administrator and records an audit entry', async () => {
    const { db, accounts, admin } = aWorld();
    const actorId = await anAdministratorId(db);
    const travelerId = await aTravelerId(accounts, db, { confirmed: true });

    const result = admin.changeRole(actorId, travelerId, 'administrator');

    expect(result).toEqual({ ok: true });
    expect((await accounts.findAccount(travelerId))?.role).toBe('administrator');
    expect(auditEntries(db)).toContainEqual(
      expect.objectContaining({ actorAccountId: actorId, action: 'account.promoted', subjectId: travelerId }),
    );
  });

  // @covers REQ-TRV-068@v2
  test('promoting a Traveler whose email address is not confirmed is refused', async () => {
    const { db, accounts, admin } = aWorld();
    const actorId = await anAdministratorId(db);
    const travelerId = await aTravelerId(accounts, db, { confirmed: false });

    const result = admin.changeRole(actorId, travelerId, 'administrator');

    expect(result).toEqual({ ok: false, error: 'email-not-confirmed' });
    expect((await accounts.findAccount(travelerId))?.role).toBe('traveler');
  });

  // @covers REQ-TRV-068@v2
  test('demoting another Administrator records an audit entry', async () => {
    const { db, accounts, admin } = aWorld();
    const actorId = await anAdministratorId(db, 'a@example.com');
    const otherId = await anAdministratorId(db, 'b@example.com');

    const result = admin.changeRole(actorId, otherId, 'traveler');

    expect(result).toEqual({ ok: true });
    expect((await accounts.findAccount(otherId))?.role).toBe('traveler');
    expect(auditEntries(db)).toContainEqual(
      expect.objectContaining({ actorAccountId: actorId, action: 'account.demoted', subjectId: otherId }),
    );
  });

  // @covers REQ-TRV-068@v2
  test('the only Administrator cannot demote themselves', async () => {
    const { db, accounts, admin } = aWorld();
    const onlyAdminId = await anAdministratorId(db);

    const result = admin.changeRole(onlyAdminId, onlyAdminId, 'traveler');

    expect(result).toEqual({ ok: false, error: 'last-administrator' });
    expect((await accounts.findAccount(onlyAdminId))?.role).toBe('administrator');
  });
});

describe('disabling accounts', () => {
  // @covers REQ-TRV-071@v2
  test('disabling a Traveler refuses their next login and records an audit entry', async () => {
    const { db, accounts, admin } = aWorld();
    const actorId = await anAdministratorId(db);
    const travelerId = await aTravelerId(accounts, db, { confirmed: true });

    admin.setDisabled(actorId, travelerId, true);
    const login = await accounts.authenticate({ email: 'traveler@example.com', password: VALID_PASSWORD });

    expect(login).toEqual({ ok: false });
    expect(auditEntries(db)).toContainEqual(
      expect.objectContaining({ actorAccountId: actorId, action: 'account.disabled', subjectId: travelerId }),
    );
  });

  // @covers REQ-TRV-071@v2
  test('disabling a Traveler ends the sessions they already have', async () => {
    const { db, accounts, sessions, admin } = aWorld();
    const actorId = await anAdministratorId(db);
    const travelerId = await aTravelerId(accounts, db, { confirmed: true });
    const sessionId = await sessions.start(travelerId);

    admin.setDisabled(actorId, travelerId, true);

    expect(await sessions.findAccountId(sessionId)).toBeNull();
  });

  // @covers REQ-TRV-071@v2
  test('re-enabling a disabled Traveler lets them log in again', async () => {
    const { db, accounts, admin } = aWorld();
    const actorId = await anAdministratorId(db);
    const travelerId = await aTravelerId(accounts, db, { confirmed: true });
    admin.setDisabled(actorId, travelerId, true);

    admin.setDisabled(actorId, travelerId, false);
    const login = await accounts.authenticate({ email: 'traveler@example.com', password: VALID_PASSWORD });

    expect(login.ok).toBe(true);
  });

  // @covers REQ-TRV-071@v2
  test('the actions on an enabled account are view, disable and change role', () => {
    expect(accountActions({ isDisabled: false })).toEqual(['view', 'disable', 'change-role']);
  });

  // @covers REQ-TRV-071@v2
  test('the actions on a disabled account are view, re-enable and change role', () => {
    expect(accountActions({ isDisabled: true })).toEqual(['view', 'enable', 'change-role']);
  });
});
