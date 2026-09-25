import { parseChatStreamLine, type ChatStreamEvent } from '../../src/shared/chat-stream';
import type { TravelerWithTrip } from './a-saved-plan-journey';
import type { TestApp } from './build-test-app';

/** Starts the application listening on a free local port, so a test can talk to it over a real connection. */
export async function listening(testApp: TestApp): Promise<string> {
  return testApp.app.listen({ port: 0, host: '127.0.0.1' });
}

export const cookieHeader = (cookies: Record<string, string>): string =>
  Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

function parsedLine(line: string): ChatStreamEvent {
  const event = parseChatStreamLine(line);
  if (!event) throw new Error(`The server sent a line that is not a chat event: ${line}`);
  return event;
}

/** The lines of a newline-delimited JSON response, each as it arrives. */
export async function* eventsOf(response: Response): AsyncGenerator<ChatStreamEvent, void, undefined> {
  if (!response.body) throw new Error('The response has no body to read.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let end = pending.indexOf('\n');
    while (end !== -1) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (line.trim() !== '') yield parsedLine(line);
      end = pending.indexOf('\n');
    }
  }
  if (pending.trim() !== '') yield parsedLine(pending);
}

/** Sends a chat message the streaming way over a real connection. */
export async function openChatStream(
  baseUrl: string,
  ready: Pick<TravelerWithTrip, 'cookies' | 'tripId'>,
  message: string,
  signal?: AbortSignal,
): Promise<{ readonly response: Response; readonly events: AsyncGenerator<ChatStreamEvent, void, undefined> }> {
  const response = await fetch(`${baseUrl}/api/trips/${ready.tripId}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(ready.cookies) },
    body: JSON.stringify({ message }),
    ...(signal ? { signal } : {}),
  });
  return { response, events: eventsOf(response) };
}

export async function allEvents(events: AsyncGenerator<ChatStreamEvent, void, undefined>): Promise<ChatStreamEvent[]> {
  const seen: ChatStreamEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

export const textOf = (events: readonly ChatStreamEvent[]): string =>
  events.flatMap((event) => (event.type === 'text' ? [event.text] : [])).join('');

export type { ChatStreamEvent };
