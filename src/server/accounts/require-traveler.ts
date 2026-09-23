import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccountService } from './account-service';
import type { SessionService } from './session-service';

export const SESSION_COOKIE = 'trv_session';

declare module 'fastify' {
  interface FastifyRequest {
    accountId?: string;
  }
}

/** Refuses any caller without a valid session with 401 (REQ-TRV-005). */
export function requireTraveler(sessions: SessionService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const rawSessionId = request.cookies[SESSION_COOKIE];
    const accountId = rawSessionId ? await sessions.findAccountId(rawSessionId) : null;
    if (!accountId) {
      await reply.code(401).send({ code: 'NOT_LOGGED_IN', message: 'Log in to continue.' });
      return;
    }
    request.accountId = accountId;
  };
}

/** Refuses a logged-in Traveler whose email address is not yet confirmed. Run after requireTraveler. */
export function requireConfirmedEmail(accountService: AccountService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const account = request.accountId ? await accountService.findAccount(request.accountId) : null;
    if (!account?.isEmailConfirmed) {
      await reply
        .code(403)
        .send({ code: 'EMAIL_NOT_CONFIRMED', message: 'Confirm your email address before creating a Trip.' });
    }
  };
}
