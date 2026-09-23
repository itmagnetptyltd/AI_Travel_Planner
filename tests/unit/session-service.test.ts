import { expect, test } from 'vitest';
import { createSessionService } from '../../src/server/accounts/session-service';
import { createAccountService } from '../../src/server/accounts/account-service';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';
import { aTestDatabase } from '../support/build-test-app';
import { aCapturingEmailService } from '../support/capturing-email-service';
import { aFixedClock } from '../support/fixed-clock';
import { VALID_PASSWORD } from '../support/a-traveler';

// @covers REQ-TRV-004@v1
test('ending a session makes its id invalid', async () => {
  const db = aTestDatabase();
  const clock = aFixedClock();
  const accountService = createAccountService({
    db,
    clock,
    email: aCapturingEmailService(),
    breachedPasswords: createListBreachedPasswordChecker([]),
    appBaseUrl: 'http://trv.test',
  });
  const registered = await accountService.register({
    email: 'traveler@example.com',
    password: VALID_PASSWORD,
  });
  const accountId = registered.ok ? registered.accountId : 'unregistered';
  const sessions = createSessionService(db, clock);
  const sessionId = await sessions.start(accountId);

  await sessions.end(sessionId);

  expect(await sessions.findAccountId(sessionId)).toBeNull();
});
