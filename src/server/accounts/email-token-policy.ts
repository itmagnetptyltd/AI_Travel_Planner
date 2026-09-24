export type EmailTokenPurpose = 'email-confirmation' | 'password-reset';

export type TokenCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'expired' | 'used' };

const HOUR_MS = 60 * 60 * 1000;

/** Client answer "Account confirmation and password reset". */
const TOKEN_LIFETIME_MS: Readonly<Record<EmailTokenPurpose, number>> = {
  'email-confirmation': 24 * HOUR_MS,
  'password-reset': HOUR_MS,
};

export function tokenExpiresAt(purpose: EmailTokenPurpose, issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + TOKEN_LIFETIME_MS[purpose]);
}

export function checkTokenUsable(
  token: { readonly expiresAt: Date; readonly usedAt: Date | null },
  now: Date,
): TokenCheck {
  if (token.usedAt !== null) {
    return { ok: false, reason: 'used' };
  }
  if (now.getTime() > token.expiresAt.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}
