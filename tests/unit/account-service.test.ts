import { describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { createAccountService, type AccountService } from '../../src/server/accounts/account-service';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';
import { accounts } from '../../src/server/db/schema';
import type { TrvDatabase } from '../../src/server/db/client';
import { aTestDatabase } from '../support/build-test-app';
import { aCapturingEmailService } from '../support/capturing-email-service';
import { aFixedClock } from '../support/fixed-clock';
import { VALID_PASSWORD } from '../support/a-traveler';

function anAccountService(db: TrvDatabase): AccountService {
  return createAccountService({
    db,
    clock: aFixedClock(),
    email: aCapturingEmailService(),
    breachedPasswords: createListBreachedPasswordChecker([]),
    appBaseUrl: 'http://trv.test',
  });
}

async function registeredAccountId(service: AccountService): Promise<string> {
  const result = await service.register({ email: 'traveler@example.com', password: VALID_PASSWORD });
  if (!result.ok) {
    throw new Error('Registration failed: ' + result.error);
  }
  return result.accountId;
}

describe('account storage', () => {
  // @covers REQ-TRV-006@v1
  test('no stored account field contains the plaintext password', async () => {
    const db = aTestDatabase();
    const accountId = await registeredAccountId(anAccountService(db));

    const row = db.select().from(accounts).where(eq(accounts.id, accountId)).get();

    expect(row).toBeDefined();
    const storedValues = Object.values(row ?? {}).map((value) => String(value));
    expect(storedValues.some((value) => value.includes(VALID_PASSWORD))).toBe(false);
  });
});

describe('authentication', () => {
  // @covers REQ-TRV-003@v1
  test('authenticating with a wrong password is refused', async () => {
    const service = anAccountService(aTestDatabase());
    await registeredAccountId(service);

    const result = await service.authenticate({
      email: 'traveler@example.com',
      password: 'wrong-password-123', // itm-sdlc:allow-secret - synthetic test password
    });

    expect(result).toEqual({ ok: false });
  });
});

describe('profile', () => {
  // @covers REQ-TRV-009@v1
  test('updating a profile detail returns the new value on the next read', async () => {
    const service = anAccountService(aTestDatabase());
    const accountId = await registeredAccountId(service);

    await service.updateProfile(accountId, { displayName: 'Aiko Tanaka' });

    expect((await service.getProfile(accountId))?.displayName).toBe('Aiko Tanaka');
  });

  // @covers REQ-TRV-010@v1
  test('saved profile preferences are returned on the next read', async () => {
    const service = anAccountService(aTestDatabase());
    const accountId = await registeredAccountId(service);

    await service.updateProfile(accountId, {
      preferredCurrency: 'USD',
      defaultTravelStyle: 'Family',
      foodPreference: 'Vegetarian',
    });

    expect(await service.getProfile(accountId)).toMatchObject({
      preferredCurrency: 'USD',
      defaultTravelStyle: 'Family',
      foodPreference: 'Vegetarian',
    });
  });
});
