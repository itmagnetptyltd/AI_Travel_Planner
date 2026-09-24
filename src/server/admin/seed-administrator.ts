import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { accounts } from '../db/schema';
import type { BreachedPasswordChecker } from '../accounts/breached-password-checker';
import { normaliseEmail } from '../accounts/account-service';
import { hashPassword } from '../accounts/password-hasher';
import { checkPassword, type PasswordProblem } from '../accounts/password-policy';

export interface SeedDeps {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly breachedPasswords: BreachedPasswordChecker;
}

export type SeedResult =
  | { readonly ok: true; readonly accountId: string }
  | { readonly ok: false; readonly error: 'email-already-registered' }
  | { readonly ok: false; readonly error: 'invalid-password'; readonly problem: PasswordProblem };

/**
 * The installation step that creates the first Administrator (REQ-TRV-068).
 * The account is created already confirmed, under the same password policy as registration.
 */
export async function seedAdministrator(
  deps: SeedDeps,
  input: { readonly email: string; readonly password: string },
): Promise<SeedResult> {
  const passwordCheck = checkPassword(input.password, deps.breachedPasswords);
  if (!passwordCheck.ok) {
    return { ok: false, error: 'invalid-password', problem: passwordCheck.problem };
  }
  const address = normaliseEmail(input.email);
  if (deps.db.select().from(accounts).where(eq(accounts.email, address)).get()) {
    return { ok: false, error: 'email-already-registered' };
  }
  const accountId = randomUUID();
  const now = deps.clock.now();
  deps.db
    .insert(accounts)
    .values({
      id: accountId,
      email: address,
      passwordHash: await hashPassword(input.password),
      role: 'administrator',
      emailConfirmedAt: now,
      createdAt: now,
    })
    .run();
  return { ok: true, accountId };
}
