import type { FastifyInstance } from 'fastify';
import {
  emailConfirmationSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registrationSchema,
} from '../../shared/account-schemas';
import { parseBody, replyInvalidPassword, replyTokenRefused } from '../http/validation';
import type { AccountService } from './account-service';
import { requireTraveler, SESSION_COOKIE } from './require-traveler';
import { SESSION_LIFETIME_MS, type SessionService } from './session-service';

export interface AccountRouteDeps {
  readonly accounts: AccountService;
  readonly sessions: SessionService;
  readonly cookieSecure: boolean;
  readonly authRateLimitPerMinute: number;
}

export async function accountRoutes(app: FastifyInstance, deps: AccountRouteDeps): Promise<void> {
  const { accounts, sessions } = deps;
  const authRoute = { config: { rateLimit: { max: deps.authRateLimitPerMinute, timeWindow: '1 minute' } } };
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: deps.cookieSecure,
    sameSite: 'lax' as const,
    maxAge: SESSION_LIFETIME_MS / 1000,
  };

  app.post('/api/accounts', authRoute, async (request, reply) => {
    const body = await parseBody(registrationSchema, request.body, reply);
    if (!body.ok) return;
    const result = await accounts.register(body.value);
    if (result.ok) {
      return reply.code(201).send({ accountId: result.accountId });
    }
    if (result.error === 'email-already-registered') {
      return reply
        .code(409)
        .send({ code: 'EMAIL_ALREADY_REGISTERED', message: 'This email address is already registered.' });
    }
    return replyInvalidPassword(reply, result.problem);
  });

  app.post('/api/email-confirmations', authRoute, async (request, reply) => {
    const body = await parseBody(emailConfirmationSchema, request.body, reply);
    if (!body.ok) return;
    const result = await accounts.confirmEmail(body.value.token);
    if (result.ok) {
      return reply.send({ confirmed: true });
    }
    return result.error === 'invalid-password' ? undefined : replyTokenRefused(reply, result.error);
  });

  app.post('/api/sessions', authRoute, async (request, reply) => {
    const body = await parseBody(loginSchema, request.body, reply);
    if (!body.ok) return;
    const result = await accounts.authenticate(body.value);
    if (!result.ok) {
      return reply.code(401).send({ code: 'LOGIN_FAILED', message: 'Email address or password is incorrect.' });
    }
    const rawSessionId = await sessions.start(result.accountId);
    return reply.setCookie(SESSION_COOKIE, rawSessionId, cookieOptions).send({ loggedIn: true });
  });

  app.get('/api/sessions/current', { preHandler: requireTraveler(sessions) }, async (request, reply) => {
    const account = request.accountId ? await accounts.findAccount(request.accountId) : null;
    if (!account) {
      return reply.code(401).send({ code: 'NOT_LOGGED_IN', message: 'Log in to continue.' });
    }
    return { email: account.email, role: account.role, isEmailConfirmed: account.isEmailConfirmed };
  });

  app.delete('/api/sessions/current', async (request, reply) => {
    const rawSessionId = request.cookies[SESSION_COOKIE];
    if (rawSessionId) {
      await sessions.end(rawSessionId);
    }
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
  });

  app.post('/api/password-resets', authRoute, async (request, reply) => {
    const body = await parseBody(passwordResetRequestSchema, request.body, reply);
    if (!body.ok) return;
    await accounts.requestPasswordReset(body.value.email);
    // Same reply whether or not the email is registered, so this does not reveal which accounts exist.
    return reply.code(202).send({ message: 'If that email address is registered, a reset link is on its way.' });
  });

  app.post('/api/password-resets/complete', authRoute, async (request, reply) => {
    const body = await parseBody(passwordResetSchema, request.body, reply);
    if (!body.ok) return;
    const result = await accounts.resetPassword(body.value);
    if (result.ok) {
      return reply.send({ passwordChanged: true });
    }
    if (result.error === 'invalid-password') {
      return replyInvalidPassword(reply, result.problem);
    }
    return replyTokenRefused(reply, result.error);
  });
}
