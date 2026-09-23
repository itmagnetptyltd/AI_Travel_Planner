import { describe, expect, test } from 'vitest';
import { checkTokenUsable, tokenExpiresAt } from '../../src/server/accounts/email-token-policy';
import { HOUR, MINUTE } from '../support/fixed-clock';

const issuedAt = new Date('2026-10-01T09:00:00Z');
const after = (milliseconds: number) => new Date(issuedAt.getTime() + milliseconds);

describe('email confirmation token', () => {
  // @covers REQ-TRV-001@v1
  test('a confirmation token 23 hours old is accepted', () => {
    const expiresAt = tokenExpiresAt('email-confirmation', issuedAt);

    expect(checkTokenUsable({ expiresAt, usedAt: null }, after(23 * HOUR))).toEqual({ ok: true });
  });

  // @covers REQ-TRV-001@v1
  test('a confirmation token 25 hours old is refused as expired', () => {
    const expiresAt = tokenExpiresAt('email-confirmation', issuedAt);

    expect(checkTokenUsable({ expiresAt, usedAt: null }, after(25 * HOUR))).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

describe('password reset token', () => {
  // @covers REQ-TRV-002@v1
  test('a reset token 50 minutes old is accepted', () => {
    const expiresAt = tokenExpiresAt('password-reset', issuedAt);

    expect(checkTokenUsable({ expiresAt, usedAt: null }, after(50 * MINUTE))).toEqual({ ok: true });
  });

  // @covers REQ-TRV-002@v1
  test('a reset token 61 minutes old is refused as expired', () => {
    const expiresAt = tokenExpiresAt('password-reset', issuedAt);

    expect(checkTokenUsable({ expiresAt, usedAt: null }, after(61 * MINUTE))).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  // @covers REQ-TRV-002@v1
  test('a reset token that was already used is refused', () => {
    const expiresAt = tokenExpiresAt('password-reset', issuedAt);

    expect(checkTokenUsable({ expiresAt, usedAt: after(5 * MINUTE) }, after(10 * MINUTE))).toEqual({
      ok: false,
      reason: 'used',
    });
  });
});
