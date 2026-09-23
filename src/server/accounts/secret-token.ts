import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** An unguessable value handed to the caller. Only its hash is ever stored. */
export function newSecretToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
