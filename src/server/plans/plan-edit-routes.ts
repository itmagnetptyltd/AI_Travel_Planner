import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { parseBody } from '../http/validation';
import { ACTIVITY_NOT_FOUND, PLAN_NOT_FOUND } from '../../shared/plan-schemas';
import { activityEditSchema, moveActivitySchema, newActivitySchema } from '../../shared/plan-edit-schemas';
import type { EditOutcome, PlanEditorService } from './plan-editor-service';

type ActivityParams = { readonly id: string; readonly activityId: string };

/** Says what went wrong with an edit. A Trip that is absent, deleted or someone else's is the same 404 as everywhere (REQ-TRV-007). */
async function replyWith(reply: FastifyReply, outcome: EditOutcome) {
  if (outcome.ok) return reply.code(200).send(outcome.plan);
  switch (outcome.error) {
    case 'trip-not-found':
      return reply.code(404).send({ code: 'TRIP_NOT_FOUND', message: 'Trip not found.' });
    case 'no-plan':
      return reply.code(404).send({ code: PLAN_NOT_FOUND, message: 'This Trip has no Plan yet.' });
    case 'activity-not-found':
      return reply.code(404).send({ code: ACTIVITY_NOT_FOUND, message: 'That Activity is not in the Plan.' });
    case 'day-not-found':
    case 'already-on-that-day':
      return reply.code(400).send({ code: 'VALIDATION_FAILED', field: 'toDay', message: 'toDay is not valid.' });
  }
}

/**
 * Editing a Plan by hand: change, remove, move or replace one Activity. Only the Trip's owner may, and
 * none of it reaches the AI.
 */
export async function planEditRoutes(
  app: FastifyInstance,
  deps: { readonly sessions: SessionService; readonly editor: PlanEditorService },
): Promise<void> {
  const loggedIn = requireTraveler(deps.sessions);
  const { editor } = deps;
  const ownerOf = (request: { accountId?: string }) => request.accountId ?? '';
  const path = '/api/trips/:id/plan/activities/:activityId';

  app.patch<{ Params: ActivityParams }>(path, { preHandler: loggedIn }, async (request, reply) => {
    const body = await parseBody(activityEditSchema, request.body, reply);
    if (!body.ok) return;
    return replyWith(reply, editor.editActivity(ownerOf(request), request.params.id, request.params.activityId, body.value));
  });

  app.delete<{ Params: ActivityParams }>(path, { preHandler: loggedIn }, async (request, reply) =>
    replyWith(reply, editor.removeActivity(ownerOf(request), request.params.id, request.params.activityId)),
  );

  app.post<{ Params: ActivityParams }>(`${path}/move`, { preHandler: loggedIn }, async (request, reply) => {
    const body = await parseBody(moveActivitySchema, request.body, reply);
    if (!body.ok) return;
    return replyWith(reply, editor.moveActivity(ownerOf(request), request.params.id, request.params.activityId, body.value.toDay));
  });

  app.post<{ Params: ActivityParams }>(`${path}/replace`, { preHandler: loggedIn }, async (request, reply) => {
    const body = await parseBody(newActivitySchema, request.body, reply);
    if (!body.ok) return;
    const { fromSuggestion, ...activity } = body.value;
    const origin = fromSuggestion === true ? 'suggestion' : 'typed';
    return replyWith(reply, editor.replaceActivity(ownerOf(request), request.params.id, request.params.activityId, activity, origin));
  });
}
