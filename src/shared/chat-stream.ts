import { z } from 'zod';
import type { ChatMessage } from './chat-schemas';

/**
 * One line of the reply to a streamed chat message (REQ-TRV-080): the reply's text as it is written, then either the saved
 * exchange or the reason it could not be saved. Each is a line of JSON, ended by a line break.
 */
export type ChatStreamEvent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'done'; readonly messages: readonly ChatMessage[] }
  | { readonly type: 'failed'; readonly code: string; readonly message: string };

const isChatMessage = (value: unknown): value is ChatMessage =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  'role' in value &&
  (value.role === 'traveler' || value.role === 'assistant') &&
  'text' in value &&
  typeof value.text === 'string';

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('done'), messages: z.array(z.custom<ChatMessage>(isChatMessage)) }),
  z.object({ type: z.literal('failed'), code: z.string(), message: z.string() }),
]);

/** The event a line holds, or null for a line that is not one, so nothing unexpected is ever shown to a Traveler. */
export function parseChatStreamLine(line: string): ChatStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = eventSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
