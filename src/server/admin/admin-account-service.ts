import { asc, count, eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { accounts } from '../db/schema';
import type { SessionService } from '../accounts/session-service';
import type { AccountAction, Role } from '../../shared/admin-functions';
import { recordAudit } from './audit-log';

export interface AdminAccountView {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly isEmailConfirmed: boolean;
  readonly isDisabled: boolean;
}

export type ChangeRoleResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: 'not-found' | 'email-not-confirmed' | 'last-administrator' };

export interface AdminAccountService {
  listAccounts(): readonly AdminAccountView[];
  getAccount(accountId: string): AdminAccountView | null;
  /** Returns false when the account does not exist. */
  setDisabled(actorId: string, accountId: string, isDisabled: boolean): boolean;
  changeRole(actorId: string, accountId: string, role: Role): ChangeRoleResult;
}

/** View, disable or re-enable, and change role. Never edit profile, never delete (REQ-TRV-071). */
export function accountActions(account: { readonly isDisabled: boolean }): readonly AccountAction[] {
  return ['view', account.isDisabled ? 'enable' : 'disable', 'change-role'];
}

export function createAdminAccountService(deps: {
  readonly db: TrvDatabase;
  readonly clock: Clock;
  readonly sessions: SessionService;
}): AdminAccountService {
  const { db, clock, sessions } = deps;
  const findRow = (accountId: string) => db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  const administratorCount = () =>
    db.select({ n: count() }).from(accounts).where(eq(accounts.role, 'administrator')).get()?.n ?? 0;

  return {
    listAccounts() {
      return db.select().from(accounts).orderBy(asc(accounts.email)).all().map(toView);
    },

    getAccount(accountId) {
      const row = findRow(accountId);
      return row ? toView(row) : null;
    },

    setDisabled(actorId, accountId, isDisabled) {
      if (!findRow(accountId)) {
        return false;
      }
      db.transaction((tx) => {
        tx.update(accounts)
          .set({ disabledAt: isDisabled ? clock.now() : null })
          .where(eq(accounts.id, accountId))
          .run();
        recordAudit(tx, clock, {
          actorAccountId: actorId,
          action: isDisabled ? 'account.disabled' : 'account.enabled',
          subjectId: accountId,
        });
      });
      if (isDisabled) {
        sessions.endAllFor(accountId);
      }
      return true;
    },

    changeRole(actorId, accountId, role) {
      const row = findRow(accountId);
      if (!row) {
        return { ok: false, error: 'not-found' };
      }
      if (row.role === role) {
        return { ok: true };
      }
      if (role === 'administrator' && row.emailConfirmedAt === null) {
        return { ok: false, error: 'email-not-confirmed' };
      }
      if (role === 'traveler' && administratorCount() <= 1) {
        return { ok: false, error: 'last-administrator' };
      }
      db.transaction((tx) => {
        tx.update(accounts).set({ role }).where(eq(accounts.id, accountId)).run();
        recordAudit(tx, clock, {
          actorAccountId: actorId,
          action: role === 'administrator' ? 'account.promoted' : 'account.demoted',
          subjectId: accountId,
        });
      });
      return { ok: true };
    },
  };
}

function toView(row: typeof accounts.$inferSelect): AdminAccountView {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    isEmailConfirmed: row.emailConfirmedAt !== null,
    isDisabled: row.disabledAt !== null,
  };
}
