import { describe, expect, test } from 'vitest';
import { checkPassword } from '../../src/server/accounts/password-policy';
import { createListBreachedPasswordChecker } from '../../src/server/accounts/breached-password-checker';

const BREACHED = 'qwertyuiop123';
const breached = createListBreachedPasswordChecker([BREACHED]);

describe('password policy', () => {
  // @covers REQ-TRV-001@v1
  test('an 11-character password is refused and names the password field', () => {
    const result = checkPassword('abcdefghijk', breached);

    expect(result).toEqual({ ok: false, field: 'password', problem: 'too-short' });
  });

  // @covers REQ-TRV-001@v1
  test('a 12-character lowercase-only password passes the policy', () => {
    const result = checkPassword('abcdefghijkl', breached);

    expect(result).toEqual({ ok: true });
  });

  // @covers REQ-TRV-001@v1
  test('a 128-character password passes the policy', () => {
    const result = checkPassword('a'.repeat(128), breached);

    expect(result).toEqual({ ok: true });
  });

  // @covers REQ-TRV-001@v1
  test('a 129-character password is refused and names the password field', () => {
    const result = checkPassword('a'.repeat(129), breached);

    expect(result).toEqual({ ok: false, field: 'password', problem: 'too-long' });
  });

  // @covers REQ-TRV-001@v1
  test('a breached password of 12 or more characters is refused and names the password field', () => {
    const result = checkPassword(BREACHED, breached);

    expect(result).toEqual({ ok: false, field: 'password', problem: 'breached' });
  });
});
