import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Answers whether a password appears on a known-breached password list (ADR-0004). */
export interface BreachedPasswordChecker {
  isBreached(password: string): boolean;
}

const BUNDLED_LIST = resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'breached-passwords.txt');

export function createListBreachedPasswordChecker(passwords: Iterable<string>): BreachedPasswordChecker {
  const known = new Set(passwords);
  return { isBreached: (password) => known.has(password) };
}

/**
 * Loads the bundled list: entries of 12–128 characters from the SecLists NCSC
 * top-100k and Pwdb top-1M lists (MIT). Shorter passwords are already refused
 * by the length rule, so they are not shipped.
 */
export function loadBundledBreachedPasswordChecker(): BreachedPasswordChecker {
  const lines = readFileSync(BUNDLED_LIST, 'utf8').split(/\r?\n/);
  return createListBreachedPasswordChecker(lines.filter((line) => line.length > 0));
}
