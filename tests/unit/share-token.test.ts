import { describe, expect, test } from 'vitest';
import { hashShareToken, isWellFormedToken, newShareToken, shareExpiry } from '../../src/server/notifications/share-token';
import { SHARE_LINK_DAYS } from '../../src/shared/share-schemas';

describe('the token in a share link', () => {
  // @covers REQ-TRV-058@v1
  test('is long, made only of characters a link can carry, and different every time', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newShareToken().token));

    expect(tokens.size).toBe(500);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  // @covers REQ-TRV-058@v1
  test('is stored only as a hash: the hash is not the token, and the same token always gives the same hash', () => {
    const { token, hash } = newShareToken();

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashShareToken(token)).toBe(hash);
  });

  // @covers REQ-TRV-058@v1
  test('gives a different hash for a token with one character changed', () => {
    const { token, hash } = newShareToken();
    const changed = `${token.slice(0, 10)}${token[10] === 'A' ? 'B' : 'A'}${token.slice(11)}`;

    expect(hashShareToken(changed)).not.toBe(hash);
  });

  // @covers REQ-TRV-058@v1
  test('is recognised by its shape, so anything else is refused before it is looked up', () => {
    expect(isWellFormedToken(newShareToken().token)).toBe(true);
    for (const bad of ['', 'short', 'x'.repeat(42), 'x'.repeat(44), `${'x'.repeat(42)}!`, `${'x'.repeat(42)} `]) expect(isWellFormedToken(bad)).toBe(false);
  });

  // @covers REQ-TRV-058@v1
  test('expires exactly 30 days after it was made', () => {
    const made = new Date('2026-09-23T09:00:00Z');

    expect(SHARE_LINK_DAYS).toBe(30);
    expect(shareExpiry(made).toISOString()).toBe('2026-10-23T09:00:00.000Z');
  });
});
