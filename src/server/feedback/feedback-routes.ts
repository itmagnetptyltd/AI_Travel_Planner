import type { FastifyInstance } from 'fastify';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { parseBody } from '../http/validation';
import { tripNotFound } from '../plans/plan-refusals';
import { PLAN_NOT_FOUND } from '../../shared/plan-schemas';
import { FEEDBACK_NOT_FOUND, feedbackInputSchema } from '../../shared/feedback-schemas';
import type { FeedbackService } from './feedback-service';

type IdParams = { readonly id: string };

/**
 * A Traveler's feedback on their own Trip: one piece per Trip, given once a Plan exists and replaced by each save
 * (REQ-TRV-062). A Trip that is absent, deleted or someone else's gets the same 404 as everywhere else.
 */
export async function feedbackRoutes(app: FastifyInstance, deps: { readonly sessions: SessionService; readonly feedback: FeedbackService }): Promise<void> {
  const loggedIn = requireTraveler(deps.sessions);
  const ownerOf = (request: { accountId?: string }) => request.accountId ?? '';

  app.put<{ Params: IdParams }>('/api/trips/:id/feedback', { preHandler: loggedIn }, async (request, reply) => {
    const body = await parseBody(feedbackInputSchema, request.body, reply);
    if (!body.ok) return;
    void reply.header('Cache-Control', 'no-store');
    const saved = deps.feedback.save(ownerOf(request), request.params.id, body.value);
    if (saved.ok) return saved.feedback;
    return saved.error === 'not-found'
      ? tripNotFound(reply)
      : reply.code(404).send({ code: PLAN_NOT_FOUND, message: 'This Trip has no Plan yet, so it cannot be rated.' });
  });

  app.get<{ Params: IdParams }>('/api/trips/:id/feedback', { preHandler: loggedIn }, async (request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    const found = deps.feedback.forTrip(ownerOf(request), request.params.id);
    if (!found.ok) return tripNotFound(reply);
    return found.feedback ?? reply.code(404).send({ code: FEEDBACK_NOT_FOUND, message: 'This Trip has no feedback yet.' });
  });
}
