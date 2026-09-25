import type { FastifyInstance, FastifyReply } from 'fastify';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { parseBody } from '../http/validation';
import { replyToRefusal, tripNotFound } from '../plans/plan-refusals';
import { chatMessageRequestSchema, MESSAGE_NOT_FOUND, PROPOSAL_NOT_PENDING, PROPOSAL_STALE } from '../../shared/chat-schemas';
import type { ChatService } from './chat-service';

type TripParams = { readonly id: string };
type MessageParams = TripParams & { readonly messageId: string };

const STALE_MESSAGE = 'The Plan has changed since this suggestion was made, so it cannot be accepted. Ask again.';

/** What went wrong deciding on a proposal. A Trip that is absent, deleted or someone else's is the usual 404 (REQ-TRV-007). */
function replyToProblem(reply: FastifyReply, problem: 'not-found' | 'message-not-found' | 'not-pending' | 'stale') {
  switch (problem) {
    case 'not-found':
      return tripNotFound(reply);
    case 'message-not-found':
      return reply.code(404).send({ code: MESSAGE_NOT_FOUND, message: 'That message is not in this chat, or has no suggested change.' });
    case 'not-pending':
      return reply.code(409).send({ code: PROPOSAL_NOT_PENDING, message: 'That suggestion has already been accepted or rejected.' });
    case 'stale':
      return reply.code(409).send({ code: PROPOSAL_STALE, message: STALE_MESSAGE });
  }
}

/**
 * A Trip's chat. Only the Trip's owner may use it, and every message that reaches the AI is sent by the
 * server, never by the browser.
 */
export async function chatRoutes(app: FastifyInstance, deps: { readonly sessions: SessionService; readonly chat: ChatService }): Promise<void> {
  const loggedIn = requireTraveler(deps.sessions);
  const { chat } = deps;
  const ownerOf = (request: { accountId?: string }) => request.accountId ?? '';

  app.get<{ Params: TripParams }>('/api/trips/:id/chat', { preHandler: loggedIn }, async (request, reply) => {
    const result = chat.list(ownerOf(request), request.params.id);
    return result.ok ? { messages: result.messages } : tripNotFound(reply);
  });

  app.post<{ Params: TripParams }>('/api/trips/:id/chat', { preHandler: loggedIn }, async (request, reply) => {
    const body = await parseBody(chatMessageRequestSchema, request.body, reply);
    if (!body.ok) return;
    const result = await chat.send(ownerOf(request), request.params.id, body.value.message);
    return result.ok ? reply.code(201).send({ messages: result.messages }) : replyToRefusal(request, reply, result, 'Chat message');
  });

  app.post<{ Params: MessageParams }>('/api/trips/:id/chat/:messageId/accept', { preHandler: loggedIn }, async (request, reply) => {
    const result = chat.accept(ownerOf(request), request.params.id, request.params.messageId);
    return result.ok ? reply.code(200).send({ plan: result.plan, message: result.message }) : replyToProblem(reply, result.error);
  });

  app.post<{ Params: MessageParams }>('/api/trips/:id/chat/:messageId/reject', { preHandler: loggedIn }, async (request, reply) => {
    const result = chat.reject(ownerOf(request), request.params.id, request.params.messageId);
    return result.ok ? reply.code(200).send({ message: result.message }) : replyToProblem(reply, result.error);
  });
}
