import { eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { sessions } from '../db/schema';
import { hashSecretToken, newSecretToken } from './secret-token';

/** Sessions live on the server so logout takes effect at once (ADR-0003). */
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionService {
  start(accountId: string): Promise<string>;
  findAccountId(rawSessionId: string): Promise<string | null>;
  end(rawSessionId: string): Promise<void>;
  /** Ends every session the account has, so a disabled account is logged out at once. */
  endAllFor(accountId: string): void;
}

export function createSessionService(db: TrvDatabase, clock: Clock): SessionService {
  return {
    async start(accountId) {
      const rawSessionId = newSecretToken();
      const now = clock.now();
      db.insert(sessions)
        .values({
          idHash: hashSecretToken(rawSessionId),
          accountId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
        })
        .run();
      return rawSessionId;
    },

    async findAccountId(rawSessionId) {
      const row = db.select().from(sessions).where(eq(sessions.idHash, hashSecretToken(rawSessionId))).get();
      if (!row || row.expiresAt.getTime() <= clock.now().getTime()) {
        return null;
      }
      return row.accountId;
    },

    async end(rawSessionId) {
      db.delete(sessions).where(eq(sessions.idHash, hashSecretToken(rawSessionId))).run();
    },

    endAllFor(accountId) {
      db.delete(sessions).where(eq(sessions.accountId, accountId)).run();
    },
  };
}
