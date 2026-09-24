import { hash, verify } from '@node-rs/argon2';

/** Argon2id — the library default. The unit test pins the `$argon2id$` prefix. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
