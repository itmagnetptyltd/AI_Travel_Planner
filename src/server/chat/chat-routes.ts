import { PassThrough } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireTraveler } from '../accounts/require-traveler';
import type { SessionService } from '../accounts/session-service';
import { parseBody } from '../http/validation';
import { replyToRefusal, tripNotFound } from '../plans/plan-refusals';
import { chatMessageRequestSchema, MESSAGE_NOT_FOUND, PROPOSAL_NOT_PENDING, PROPOSAL_STALE } from '../../shared/chat-schemas';
import type { ChatStreamEvent } from '../../shared/chat-stream';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE } from '../../shared/plan-schemas';
import type { ChatService, SendResult } from './chat-service';

type TripParams = { readonly id: string };
type MessageParams = TripParams & { readonly messageId: string };

const GENERAL_FAILURE: ChatStreamEvent = { type: 'failed', code: 'INTERNAL_ERROR', message: 'Something went wrong. Try again.' };

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

/** What a Traveler is told, in the last line of a stream, when the exchange could not be saved. The AI's own failure is never described. */
function failureEvent(request: FastifyRequest, result: Extract<SendResult, { ok: false }>): ChatStreamEvent {
  switch (result.error) {
    case 'ai-unavailable':
      request.log.warn({ params: request.params, reason: result.reason }, 'Chat message failed');
      return { type: 'failed', code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE };
    case 'not-found':
      return { type: 'failed', code: 'TRIP_NOT_FOUND', message: 'Trip not found.' };
    case 'no-plan':
    case 'limit-reached':
      // Both are refused before anything streams, so neither can end a stream; if one ever does, it is not the Traveler's doing.
      return GENERAL_FAILURE;
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

  /**
   * The same message as above, answered as the AI writes: lines of JSON, the reply's text first and then the saved exchange
   * (REQ-TRV-080). A refusal (no such Trip, a wrong message, the day's limit) is an ordinary error, sent before anything streams.
   * The exchange is saved even if the browser has gone away, exactly as it is when the reply is not streamed.
   */
  app.post<{ Params: TripParams }>('/api/trips/:id/chat/stream', { preHandler: loggedIn }, async (request, reply) => {
    const body = await parseBody(chatMessageRequestSchema, request.body, reply);
    if (!body.ok) return;
    const started = chat.start(ownerOf(request), request.params.id, body.value.message);
    if (!started.ok) return replyToRefusal(request, reply, started, 'Chat message');

    const lines = new PassThrough();
    const send = (event: ChatStreamEvent) => {
      if (!lines.destroyed && !lines.writableEnded) lines.write(`${JSON.stringify(event)}
`);
    };
    reply.raw.on('close', () => lines.destroy());
    started
      .run((text) => send({ type: 'text', text }))
      .then((result) => send(result.ok ? { type: 'done', messages: result.messages } : failureEvent(request, result)))
      .catch((error: unknown) => {
        request.log.error({ err: error }, 'Chat message failed');
        send(GENERAL_FAILURE);
      })
      .finally(() => lines.end());
    return reply.header('Cache-Control', 'no-store').header('X-Accel-Buffering', 'no').type('application/x-ndjson; charset=utf-8').send(lines);
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
