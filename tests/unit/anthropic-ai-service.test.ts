import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, test } from 'vitest';
import { AiUnavailableError } from '../../src/server/ai/ai-service';
import { createAnthropicAiService } from '../../src/server/ai/anthropic-ai-service';

const API_KEY = 'sk-ant-test-key-that-must-never-appear'; // itm-sdlc:allow-secret - synthetic test key

type Create = Parameters<typeof createAnthropicAiService>[0]['client'];

function aClientReturning(message: {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly stop_reason: string | null;
  readonly usage?: { readonly input_tokens: number; readonly output_tokens: number };
}): { readonly client: NonNullable<Create>; readonly calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      messages: {
        create: async (params: unknown) => {
          calls.push(params);
          return { usage: { input_tokens: 10, output_tokens: 20 }, ...message };
        },
      },
    },
  };
}

function aClientFailingWith(error: unknown): NonNullable<Create> {
  return {
    messages: {
      create: async () => {
        throw error;
      },
    },
  };
}

const REQUEST = { system: 'You plan trips.', user: 'Plan a trip to Kyoto.', maxOutputTokens: 4_000 };

function serviceOver(client: NonNullable<Create>) {
  return createAnthropicAiService({ apiKey: API_KEY, model: 'a-model', client });
}

describe('the Anthropic AI service', () => {
  // @covers REQ-TRV-081@v1
  test('sends the system text, the user text, the model and the token cap, and returns the reply text with its token counts', async () => {
    const { client, calls } = aClientReturning({ content: [{ type: 'text', text: '{"days":[]}' }], stop_reason: 'end_turn' });

    const reply = await serviceOver(client).complete({ ...REQUEST, signal: new AbortController().signal });

    expect(reply).toEqual({ text: '{"days":[]}', inputTokens: 10, outputTokens: 20 });
    expect(calls).toEqual([
      {
        model: 'a-model',
        max_tokens: 4_000,
        system: 'You plan trips.',
        messages: [{ role: 'user', content: 'Plan a trip to Kyoto.' }],
      },
    ]);
  });

  // @covers REQ-TRV-081@v1
  test('joins the text blocks of a reply and ignores thinking blocks', async () => {
    const { client } = aClientReturning({
      content: [{ type: 'thinking' }, { type: 'text', text: '{"days":' }, { type: 'text', text: '[]}' }],
      stop_reason: 'end_turn',
    });

    const reply = await serviceOver(client).complete({ ...REQUEST, signal: new AbortController().signal });

    expect(reply.text).toBe('{"days":[]}');
  });

  // @covers REQ-TRV-081@v1
  test.each(['max_tokens', 'refusal'])('treats a reply that stopped for %s as the AI being unavailable', async (stop) => {
    const { client } = aClientReturning({ content: [{ type: 'text', text: 'partial' }], stop_reason: stop });

    await expect(serviceOver(client).complete({ ...REQUEST, signal: new AbortController().signal })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  // @covers REQ-TRV-081@v1
  test('treats a provider error as the AI being unavailable, naming the status and never the request or the key', async () => {
    const providerError = new Anthropic.APIError(529, { error: { message: `overloaded for ${API_KEY} Plan a trip to Kyoto.` } }, 'overloaded', new Headers());

    const failure = await serviceOver(aClientFailingWith(providerError))
      .complete({ ...REQUEST, signal: new AbortController().signal })
      .catch((error: unknown) => error);

    const message = failure instanceof Error ? failure.message : '';
    expect(failure).toBeInstanceOf(AiUnavailableError);
    expect(message).toContain('529');
    expect(message).not.toContain(API_KEY);
    expect(message).not.toContain('Kyoto');
  });

  // @covers REQ-TRV-081@v1
  test('treats a network failure as the AI being unavailable', async () => {
    await expect(
      serviceOver(aClientFailingWith(new Error('socket hang up'))).complete({ ...REQUEST, signal: new AbortController().signal }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });

  // @covers REQ-TRV-081@v1
  test('treats a reply it cannot read as the AI being unavailable, not as a crash', async () => {
    const client = { messages: { create: async () => JSON.parse('{"stop_reason":"end_turn"}') } };

    await expect(serviceOver(client).complete({ ...REQUEST, signal: new AbortController().signal })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});
