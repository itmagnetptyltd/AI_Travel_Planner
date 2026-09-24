import type { BreachedPasswordChecker } from './breached-password-checker';

/** Client answer "Password rules": 12–128 characters, no character-mix rules, not breached. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordProblem = 'too-short' | 'too-long' | 'breached';

export type PasswordCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly field: 'password'; readonly problem: PasswordProblem };

export function checkPassword(password: string, breached: BreachedPasswordChecker): PasswordCheck {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return { ok: false, field: 'password', problem: 'too-short' };
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return { ok: false, field: 'password', problem: 'too-long' };
  }
  if (breached.isBreached(password)) {
    return { ok: false, field: 'password', problem: 'breached' };
  }
  return { ok: true };
}
