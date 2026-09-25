import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AccountService } from '../accounts/account-service';
import { requireConfirmedEmail, requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { describeMailFailure } from '../email/mail-failure';
import { parseBody } from '../http/validation';
import { tripNotFound } from '../plans/plan-refusals';
import { PLAN_NOT_FOUND } from '../../shared/plan-schemas';
import {
  EMAIL_FAILED,
  EMAIL_FAILED_MESSAGE,
  SHARE_EXPIRED,
  SHARE_EXPIRED_MESSAGE,
  SHARE_LIMIT_REACHED,
  SHARE_NOT_FOUND,
  SHARE_NOT_FOUND_MESSAGE,
  shareRequestSchema,
} from '../../shared/share-schemas';
import type { ShareResult, ShareService, OwnEmailResult } from './share-service';

type IdParams = { readonly id: string };

type Refusal = Exclude<ShareResult | OwnEmailResult, { ok: true }>;

function replyToRefusal(request: FastifyRequest, reply: FastifyReply, refusal: Refusal) {
  switch (refusal.error) {
    case 'not-found':
      return tripNotFound(reply);
    case 'no-plan':
      return reply.code(404).send({ code: PLAN_NOT_FOUND, message: 'This Trip has no Plan yet.' });
    case 'invalid-recipient':
      return reply.code(400).send({ code: 'VALIDATION_FAILED', field: refusal.field, message: `${refusal.field} is not valid.` });
    case 'limit-reached':
      return reply.code(429).send({
        code: SHARE_LIMIT_REACHED,
        limit: refusal.limit,
        resetsAt: refusal.resetsAt.toISOString(),
        message: `You have shared this Trip with ${refusal.limit} people today. Try again after ${refusal.resetsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
      });
    case 'email-failed':
      // The detail goes to the log; the Traveler is told only that nothing was sent.
      request.log.error({ failure: describeMailFailure(refusal.cause) }, 'A Plan email could not be sent');
      return reply.code(502).send({ code: EMAIL_FAILED, message: EMAIL_FAILED_MESSAGE });
  }
}

/**
 * Emailing a Plan and sharing it. Only the Trip's owner may make, list or revoke a link, and a Trip that is absent,
 * deleted or someone else's gets the same 404 as everywhere else. The one public route is the read-only view: whoever
 * holds a valid link may open it, and it can never change anything.
 */
export async function shareRoutes(
  app: FastifyInstance,
  deps: {
    readonly accounts: AccountService;
    readonly sessions: SessionService;
    readonly shares: ShareService;
    /** The most requests a minute, from one address, to the routes that send email or open a link. */
    readonly rateLimitPerMinute: number;
  },
): Promise<void> {
  const { shares } = deps;
  const loggedIn = requireTraveler(deps.sessions);
  const confirmed = requireConfirmedEmail(deps.accounts);
  const ownerOf = (request: { accountId?: string }) => request.accountId ?? '';
  const limited = { config: { rateLimit: { max: deps.rateLimitPerMinute, timeWindow: '1 minute' } } };

  app.post<{ Params: IdParams }>('/api/trips/:id/plan/email', { ...limited, preHandler: [loggedIn, confirmed] }, async (request, reply) => {
    const result = await shares.emailToOwner(ownerOf(request), request.params.id);
    return result.ok ? { sentTo: result.sentTo } : replyToRefusal(request, reply, result);
  });

  app.post<{ Params: IdParams }>('/api/trips/:id/shares', { ...limited, preHandler: [loggedIn, confirmed] }, async (request, reply) => {
    const body = await parseBody(shareRequestSchema, request.body, reply);
    if (!body.ok) return;
    const result = await shares.shareWithRecipient(ownerOf(request), request.params.id, body.value.recipient);
    return result.ok ? reply.code(201).send(result.share) : replyToRefusal(request, reply, result);
  });

  app.get<{ Params: IdParams }>('/api/trips/:id/shares', { preHandler: loggedIn }, async (request, reply) => {
    const list = shares.list(ownerOf(request), request.params.id);
    return list ? { shares: list } : tripNotFound(reply);
  });

  app.delete<{ Params: IdParams & { shareId: string } }>('/api/trips/:id/shares/:shareId', { preHandler: loggedIn }, async (request, reply) =>
    shares.revoke(ownerOf(request), request.params.id, request.params.shareId) ? reply.code(204).send() : tripNotFound(reply),
  );

  app.get<{ Params: { token: string } }>('/api/shared/:token', limited, async (request, reply) => {
    // The address holds a secret: it must never be cached, and never passed on in a Referer header (helmet sends no-referrer).
    void reply.header('Cache-Control', 'no-store');
    const opened = shares.view(request.params.token);
    if (opened.ok) return opened.view;
    return opened.error === 'expired'
      ? reply.code(410).send({ code: SHARE_EXPIRED, message: SHARE_EXPIRED_MESSAGE })
      : reply.code(404).send({ code: SHARE_NOT_FOUND, message: SHARE_NOT_FOUND_MESSAGE });
  });
}
