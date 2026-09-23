import { z } from 'zod';

export const EMAIL_MAX_LENGTH = 254;
/** Upper bound on what is accepted over the wire; the policy (12–128) is applied separately. */
const PASSWORD_WIRE_MAX_LENGTH = 1024;
const TOKEN_MAX_LENGTH = 200;

const email = z.email().max(EMAIL_MAX_LENGTH);
const password = z.string().max(PASSWORD_WIRE_MAX_LENGTH); // itm-sdlc:allow-secret - schema declaration, not a credential

export const registrationSchema = z.object({ email, password }).strict();
export const loginSchema = z.object({ email: z.string().max(EMAIL_MAX_LENGTH), password }).strict();
export const emailConfirmationSchema = z.object({ token: z.string().min(1).max(TOKEN_MAX_LENGTH) }).strict();
export const passwordResetRequestSchema = z.object({ email: z.string().max(EMAIL_MAX_LENGTH) }).strict();
export const passwordResetSchema = z
  .object({ token: z.string().min(1).max(TOKEN_MAX_LENGTH), newPassword: password })
  .strict();
