import type { ChatMessage } from '../../shared/chat-schemas';
import { parseChatStreamLine, type ChatStreamEvent } from '../../shared/chat-stream';
import { apiErrorFrom, type ApiError } from '../api-client';

/** What is on show of a reply that is still arriving, and how it ended once it has (REQ-TRV-080). */
export interface StreamedReply {
  /** The reply so far. Empty once the reply has ended: what is shown then is the saved message, or nothing. */
  readonly text: string;
  readonly outcome: { readonly kind: 'done'; readonly messages: readonly ChatMessage[] } | { readonly kind: 'failed'; readonly code: string; readonly message: string } | null;
}

export const NOTHING_STREAMED: StreamedReply = { text: '', outcome: null };

/** Adds one event to what is on show. Nothing that arrives after the reply has ended changes it. */
export function foldStreamEvent(state: StreamedReply, event: ChatStreamEvent): StreamedReply {
  if (state.outcome) return state;
  switch (event.type) {
    case 'text':
      return { text: state.text + event.text, outcome: null };
    case 'done':
      return { text: '', outcome: { kind: 'done', messages: event.messages } };
    case 'failed':
      return { text: '', outcome: { kind: 'failed', code: event.code, message: event.message } };
  }
}

/** The whole lines in what has arrived so far, and the half-arrived line, if any, to be joined to what comes next. */
export function splitLines(pending: string, chunk: string): { readonly lines: readonly string[]; readonly pending: string } {
  const parts = (pending + chunk).split('\n');
  const unfinished = parts.pop() ?? '';
  return { lines: parts.filter((line) => line.trim() !== ''), pending: unfinished };
}

const NETWORK_ERROR: ApiError = { code: 'NETWORK', message: 'Could not reach the server. Try again.' };
const LOST_CONNECTION: ApiError = {
  code: 'NETWORK',
  message: 'The connection was lost before the reply was finished. The server may have kept your message and its reply, so check the chat before sending again.',
};

/** How a streamed message ended, for the Traveler: the saved exchange, or what to say and whether the chat must be read again. */
export type StreamEnding =
  | { readonly kind: 'done'; readonly messages: readonly ChatMessage[] }
  | { readonly kind: 'problem'; readonly error: ApiError; readonly shouldReloadChat: boolean };

/**
 * A message the server refused before it began, or a reply that failed, is not saved and can be sent again. A reply cut off by a
 * lost connection may have been saved (the server saves it whether or not anyone is reading), so the chat is read again and
 * sending it again is left to the Traveler.
 */
export function endingOf(start: StreamStart, reply: StreamedReply): StreamEnding {
  if (!start.ok) return { kind: 'problem', error: start.error, shouldReloadChat: false };
  if (reply.outcome?.kind === 'done') return { kind: 'done', messages: reply.outcome.messages };
  if (reply.outcome?.kind === 'failed') return { kind: 'problem', error: { code: reply.outcome.code, message: reply.outcome.message }, shouldReloadChat: false };
  return { kind: 'problem', error: LOST_CONNECTION, shouldReloadChat: true };
}

export type StreamStart = { readonly ok: true } | { readonly ok: false; readonly status: number; readonly error: ApiError };

/**
 * Sends a chat message and reads the reply as it arrives, calling `onEvent` for each line. Resolves when the reply has ended,
 * or when the server refused the message before it began (an ordinary error, with nothing streamed). Never throws.
 */
export async function streamChatMessage(chatPath: string, message: string, onEvent: (event: ChatStreamEvent) => void): Promise<StreamStart> {
  let response: Response;
  try {
    response = await fetch(`${chatPath}/stream`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    return { ok: false, status: response.status, error: apiErrorFrom(payload) };
  }
  if (!response.body) return { ok: false, status: 0, error: NETWORK_ERROR };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const split = splitLines(pending, decoder.decode(value, { stream: true }));
      pending = split.pending;
      for (const line of split.lines) {
        const event = parseChatStreamLine(line);
        if (event) onEvent(event);
      }
    }
  } catch {
    // The connection broke part way: whatever has been read stands, and the caller sees that no ending arrived.
  }
  return { ok: true };
}
