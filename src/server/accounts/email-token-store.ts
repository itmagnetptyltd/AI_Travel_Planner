import { eq } from 'drizzle-orm';
import type { Clock } from '../clock';
import type { TrvDatabase } from '../db/client';
import { emailTokens } from '../db/schema';
import { checkTokenUsable, tokenExpiresAt, type EmailTokenPurpose } from './email-token-policy';
import { hashSecretToken, newSecretToken } from './secret-token';

export type TokenRedemption =
  | { readonly ok: true; readonly accountId: string }
  | { readonly ok: false; readonly error: 'expired' | 'used' | 'invalid' };

export interface EmailTokenStore {
  issue(accountId: string, purpose: EmailTokenPurpose): string;
  /** Checks the token and marks it used in one step. */
  redeem(rawToken: string, purpose: EmailTokenPurpose): TokenRedemption;
  /** Checks the token without using it up. */
  peek(rawToken: string, purpose: EmailTokenPurpose): TokenRedemption;
}

export function createEmailTokenStore(db: TrvDatabase, clock: Clock): EmailTokenStore {
  const check = (rawToken: string, purpose: EmailTokenPurpose): TokenRedemption => {
    const row = db.select().from(emailTokens).where(eq(emailTokens.tokenHash, hashSecretToken(rawToken))).get();
    if (!row || row.purpose !== purpose) {
      return { ok: false, error: 'invalid' };
    }
    const usable = checkTokenUsable({ expiresAt: row.expiresAt, usedAt: row.usedAt }, clock.now());
    return usable.ok ? { ok: true, accountId: row.accountId } : { ok: false, error: usable.reason };
  };

  return {
    issue(accountId, purpose) {
      const rawToken = newSecretToken();
      db.insert(emailTokens)
        .values({
          tokenHash: hashSecretToken(rawToken),
          accountId,
          purpose,
          expiresAt: tokenExpiresAt(purpose, clock.now()),
          usedAt: null,
        })
        .run();
      return rawToken;
    },

    redeem(rawToken, purpose) {
      const result = check(rawToken, purpose);
      if (result.ok) {
        db.update(emailTokens)
          .set({ usedAt: clock.now() })
          .where(eq(emailTokens.tokenHash, hashSecretToken(rawToken)))
          .run();
      }
      return result;
    },

    peek: check,
  };
}
