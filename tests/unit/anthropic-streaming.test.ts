import { describe, expect, test } from 'vitest';
import { AiUnavailableError } from '../../src/server/ai/ai-service';
import { createAnthropicAiService } from '../../src/server/ai/anthropic-ai-service';

const API_KEY = 'sk-ant-test-key-that-must-never-appear'; // itm-sdlc:allow-secret - synthetic test key

type Client = NonNullable<Parameters<typeof createAnthropicAiService>[0]['client']>;

const REQUEST = { system: 'be brief', user: 'hello', maxOutputTokens: 500 };

interface Message {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly stop_reason: string | null;
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

const MESSAGE: Message = { content: [{ type: 'text', text: 'Hello there, traveler' }], stop_reason: 'end_turn', usage: { input_tokens: 12, output_tokens: 34 } };

/** A client that can create a whole message, and can stream one: it gives each piece to the `text` listener, then the whole message. */
function aClientStreaming(pieces: readonly string[], options: { readonly failWith?: Error; readonly message?: Message } = {}) {
  const calls: { via: 'create' | 'stream'; params: unknown }[] = [];
  const client = {
    messages: {
      create: async (params: unknown) => {
        calls.push({ via: 'create', params });
        return options.message ?? MESSAGE;
      },
      stream: (params: unknown) => {
        calls.push({ via: 'stream', params });
        const listeners: ((delta: string) => void)[] = [];
        return {
          on(event: 'text', listener: (delta: string) => void) {
            if (event === 'text') listeners.push(listener);
            return this;
          },
          async finalMessage() {
            for (const piece of pieces) for (const listener of listeners) listener(piece);
            if (options.failWith) throw options.failWith;
            return options.message ?? MESSAGE;
          },
        };
      },
    },
  } as unknown as Client;
  return { client, calls };
}

const serviceOver = (client: Client) => createAnthropicAiService({ apiKey: API_KEY, model: 'a-model', client });

describe('the Anthropic AI service, when the caller wants the reply as it is written', () => {
  // @covers REQ-TRV-080@v1
  test('gives the caller each piece of text as it arrives, and still returns the whole reply with its token counts', async () => {
    const { client, calls } = aClientStreaming(['Hello ', 'there, ', 'traveler']);
    const heard: string[] = [];

    const reply = await serviceOver(client).complete({ ...REQUEST, signal: new AbortController().signal, onText: (delta) => heard.push(delta) });

    expect(heard).toEqual(['Hello ', 'there, ', 'traveler']);
    expect(reply).toEqual({ text: 'Hello there, traveler', inputTokens: 12, outputTokens: 34 });
    expect(calls.map((call) => call.via)).toEqual(['stream']);
    expect(calls[0]?.params).toMatchObject({ model: 'a-model', max_tokens: 500, system: 'be brief', messages: [{ role: 'user', content: 'hello' }] });
  });

  // @covers REQ-TRV-080@v1
  test('still makes the ordinary, whole-reply call when the caller does not ask for pieces', async () => {
    const { client, calls } = aClientStreaming(['never heard']);

    const reply = await serviceOver(client).complete({ ...REQUEST, signal: new AbortController().signal });

    expect(reply.text).toBe('Hello there, traveler');
    expect(calls.map((call) => call.via)).toEqual(['create']);
  });

  // @covers REQ-TRV-080@v1
  test('says the AI is unavailable, with nothing of the request or the key, when the stream breaks after some text', async () => {
    const { client } = aClientStreaming(['Hello '], { failWith: new Error(`connection dropped while sending ${API_KEY} and "be brief"`) });
    const heard: string[] = [];

    const failure = await serviceOver(client)
      .complete({ ...REQUEST, signal: new AbortController().signal, onText: (delta) => heard.push(delta) })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AiUnavailableError);
    expect((failure as Error).message).not.toContain(API_KEY);
    expect((failure as Error).message).not.toContain('be brief');
    expect(heard).toEqual(['Hello ']);
  });

  // @covers REQ-TRV-080@v1
  test('refuses a streamed reply that stopped early, as it refuses a whole one', async () => {
    const { client } = aClientStreaming(['Hello '], { message: { ...MESSAGE, stop_reason: 'max_tokens' } });

    const failure = await serviceOver(client)
      .complete({ ...REQUEST, signal: new AbortController().signal, onText: () => undefined })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AiUnavailableError);
  });

  // @covers REQ-TRV-080@v1
  test('answers with the whole reply, and gives no pieces, when the client it was given cannot stream', async () => {
    const client = { messages: { create: async () => MESSAGE } } as unknown as Client;
    const heard: string[] = [];

    const reply = await serviceOver(client).complete({ ...REQUEST, signal: new AbortController().signal, onText: (delta) => heard.push(delta) });

    expect(reply.text).toBe('Hello there, traveler');
    expect(heard).toEqual([]);
  });
});
