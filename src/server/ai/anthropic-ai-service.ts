import Anthropic from '@anthropic-ai/sdk';
import { AiUnavailableError, type AiReply, type AiService } from './ai-service';

interface ProviderMessage {
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly stop_reason: string | null;
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

/** The one call this adapter makes, so a test can supply it without touching the network. */
export interface AnthropicMessagesClient {
  readonly messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<ProviderMessage>;
  };
}

export interface AnthropicAiOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly client?: AnthropicMessagesClient;
}

/** A reply that stopped for either of these is cut short or declined, so it is not a usable Plan. */
const UNUSABLE_STOP_REASONS = ['max_tokens', 'refusal'];

function realClient(apiKey: string): AnthropicMessagesClient {
  const client = new Anthropic({ apiKey });
  return { messages: { create: (params, options) => client.messages.create(params, options) } };
}

/** What is safe to say about a failure: the status, never the request, the reply or the key. */
function describeFailure(error: unknown): string {
  if (error instanceof Anthropic.APIError && error.status !== undefined) {
    return `The AI provider answered with status ${error.status}.`;
  }
  return 'The AI provider could not be reached.';
}

/** A reply that is missing what it should carry, or that stopped early, is not a usable answer. */
function toReply(message: ProviderMessage): AiReply {
  const { content, usage, stop_reason: stopReason } = message;
  if (!Array.isArray(content) || typeof usage?.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') {
    throw new AiUnavailableError('The AI reply could not be read.');
  }
  if (stopReason !== null && UNUSABLE_STOP_REASONS.includes(stopReason)) {
    throw new AiUnavailableError(`The AI reply stopped early (${stopReason}).`);
  }
  const text = content.map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
  return { text, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}

/**
 * The only file that imports the AI provider's library (REQ-TRV-081). Every failure leaves here as an
 * AiUnavailableError whose message carries no request text and no key.
 */
export function createAnthropicAiService(options: AnthropicAiOptions): AiService {
  const client = options.client ?? realClient(options.apiKey);
  return {
    async complete(request): Promise<AiReply> {
      try {
        const message = await client.messages.create(
          {
            model: options.model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: [{ role: 'user', content: request.user }],
          },
          { signal: request.signal },
        );
        return toReply(message);
      } catch (error) {
        throw error instanceof AiUnavailableError ? error : new AiUnavailableError(describeFailure(error));
      }
    },
  };
}
