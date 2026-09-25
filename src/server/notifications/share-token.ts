import { createHash, randomBytes } from 'node:crypto';
import { SHARE_LINK_DAYS } from '../../shared/share-schemas';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
/** 32 bytes as unpadded base64url. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const hashShareToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * A new link token. It is random and is given nothing about the Trip, so it cannot contain or reveal the Trip's
 * identifier. Only the hash is stored, so a copy of the database yields no working link.
 */
export function newShareToken(): { readonly token: string; readonly hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashShareToken(token) };
}

/** Anything of another shape is refused before it is looked up. */
export const isWellFormedToken = (token: string): boolean => TOKEN_PATTERN.test(token);

export const shareExpiry = (madeAt: Date): Date => new Date(madeAt.getTime() + SHARE_LINK_DAYS * DAY_MS);
