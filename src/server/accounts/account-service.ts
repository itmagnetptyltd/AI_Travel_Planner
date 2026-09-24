import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { accounts } from '../db/schema';
import type { EmailService } from '../email/email-service';
import { confirmationEmail, passwordResetEmail } from '../email/account-email-templates';
import type { BreachedPasswordChecker } from './breached-password-checker';
import { createEmailTokenStore } from './email-token-store';
import { hashPassword, verifyPassword } from './password-hasher';
import { checkPassword, type PasswordProblem } from './password-policy';

export interface Profile {
  readonly displayName: string | null;
  readonly preferredCurrency: string | null;
  readonly defaultTravelStyle: string | null;
  readonly foodPreference: string | null;
}

export interface AccountView {
  readonly id: string;
  readonly email: string;
  readonly role: 'traveler' | 'administrator';
  readonly isEmailConfirmed: boolean;
}

type InvalidPassword = {
  readonly ok: false;
  readonly error: 'invalid-password';
  readonly field: 'password';
  readonly problem: PasswordProblem;
};

export type RegisterResult =
  | { readonly ok: true; readonly accountId: string }
  | { readonly ok: false; readonly error: 'email-already-registered' }
  | InvalidPassword;

export type TokenResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'expired' | 'used' | 'invalid' }
  | InvalidPassword;

export interface AccountServiceDeps {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly email: EmailService;
  readonly breachedPasswords: BreachedPasswordChecker;
  readonly appBaseUrl: string;
}

export interface AccountService {
  register(input: { email: string; password: string }): Promise<RegisterResult>;
  authenticate(input: { email: string; password: string }): Promise<{ ok: true; accountId: string } | { ok: false }>;
  confirmEmail(rawToken: string): Promise<TokenResult>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(input: { token: string; newPassword: string }): Promise<TokenResult>;
  findAccount(accountId: string): Promise<AccountView | null>;
  getProfile(accountId: string): Promise<Profile | null>;
  updateProfile(accountId: string, update: Partial<Profile>): Promise<Profile>;
}

/** Email addresses are compared case-insensitively and without surrounding space. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAccountService(deps: AccountServiceDeps): AccountService {
  const { db, clock, email, breachedPasswords, appBaseUrl } = deps;
  const tokens = createEmailTokenStore(db, clock);
  const findByEmail = (address: string) =>
    db.select().from(accounts).where(eq(accounts.email, normaliseEmail(address))).get();
  const findById = (accountId: string) => db.select().from(accounts).where(eq(accounts.id, accountId)).get();

  // Verifying against a throwaway hash when the email is unknown keeps the
  // response time the same, so login does not reveal which emails exist.
  let unknownAccountHash: Promise<string> | undefined;
  const hashForUnknownAccount = () => (unknownAccountHash ??= hashPassword(randomUUID()));

  return {
    async register(input) {
      const passwordCheck = checkPassword(input.password, breachedPasswords);
      if (!passwordCheck.ok) {
        return { ok: false, error: 'invalid-password', field: passwordCheck.field, problem: passwordCheck.problem };
      }
      const address = normaliseEmail(input.email);
      if (findByEmail(address)) {
        return { ok: false, error: 'email-already-registered' };
      }
      const accountId = randomUUID();
      db.insert(accounts)
        .values({
          id: accountId,
          email: address,
          passwordHash: await hashPassword(input.password),
          role: 'traveler',
          emailConfirmedAt: null,
          createdAt: clock.now(),
        })
        .run();
      const token = tokens.issue(accountId, 'email-confirmation');
      await email.send(confirmationEmail(address, appBaseUrl, token));
      return { ok: true, accountId };
    },

    async authenticate(input) {
      const account = findByEmail(input.email);
      const isValid = await verifyPassword(account?.passwordHash ?? (await hashForUnknownAccount()), input.password);
      return account && isValid ? { ok: true, accountId: account.id } : { ok: false };
    },

    async confirmEmail(rawToken) {
      const redemption = tokens.redeem(rawToken, 'email-confirmation');
      if (!redemption.ok) {
        return redemption;
      }
      db.update(accounts).set({ emailConfirmedAt: clock.now() }).where(eq(accounts.id, redemption.accountId)).run();
      return { ok: true };
    },

    async requestPasswordReset(address) {
      const account = findByEmail(address);
      if (!account) {
        return;
      }
      const token = tokens.issue(account.id, 'password-reset');
      await email.send(passwordResetEmail(account.email, appBaseUrl, token));
    },

    async resetPassword(input) {
      const usable = tokens.peek(input.token, 'password-reset');
      if (!usable.ok) {
        return usable;
      }
      const passwordCheck = checkPassword(input.newPassword, breachedPasswords);
      if (!passwordCheck.ok) {
        return { ok: false, error: 'invalid-password', field: passwordCheck.field, problem: passwordCheck.problem };
      }
      const redemption = tokens.redeem(input.token, 'password-reset');
      if (!redemption.ok) {
        return redemption;
      }
      const passwordHash = await hashPassword(input.newPassword);
      db.update(accounts).set({ passwordHash }).where(eq(accounts.id, redemption.accountId)).run();
      return { ok: true };
    },

    async findAccount(accountId) {
      const account = findById(accountId);
      if (!account) {
        return null;
      }
      return {
        id: account.id,
        email: account.email,
        role: account.role,
        isEmailConfirmed: account.emailConfirmedAt !== null,
      };
    },

    async getProfile(accountId) {
      const account = findById(accountId);
      return account ? toProfile(account) : null;
    },

    async updateProfile(accountId, update) {
      db.update(accounts).set(pickProfileFields(update)).where(eq(accounts.id, accountId)).run();
      const account = findById(accountId);
      if (!account) {
        throw new Error(`Profile update for unknown account ${accountId}`);
      }
      return toProfile(account);
    },
  };
}

function toProfile(account: typeof accounts.$inferSelect): Profile {
  return {
    displayName: account.displayName,
    preferredCurrency: account.preferredCurrency,
    defaultTravelStyle: account.defaultTravelStyle,
    foodPreference: account.foodPreference,
  };
}

/** Copies only the profile fields, by name — never the caller's whole object. */
function pickProfileFields(update: Partial<Profile>): Partial<Profile> {
  return {
    ...(update.displayName !== undefined ? { displayName: update.displayName } : {}),
    ...(update.preferredCurrency !== undefined ? { preferredCurrency: update.preferredCurrency } : {}),
    ...(update.defaultTravelStyle !== undefined ? { defaultTravelStyle: update.defaultTravelStyle } : {}),
    ...(update.foodPreference !== undefined ? { foodPreference: update.foodPreference } : {}),
  };
}
