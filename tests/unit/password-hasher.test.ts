import { expect, test } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/server/accounts/password-hasher';

// @covers REQ-TRV-001@v1
test('a hashed password is Argon2id and verifies against the original', async () => {
  const hash = await hashPassword('amber-lantern-harbour');

  expect(hash.startsWith('$argon2id$')).toBe(true);
  expect(await verifyPassword(hash, 'amber-lantern-harbour')).toBe(true);
  expect(await verifyPassword(hash, 'amber-lantern-harbouR')).toBe(false);
});
