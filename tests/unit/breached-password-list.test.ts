import { expect, test } from 'vitest';
import { loadBundledBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';

// @covers REQ-TRV-001@v1
test('the bundled breached list refuses a well-known breached password of 12+ characters', () => {
  const checker = loadBundledBreachedPasswordChecker();

  expect(checker.isBreached('qwertyuiop123')).toBe(true);
  expect(checker.isBreached('amber-lantern-harbour')).toBe(false);
});
