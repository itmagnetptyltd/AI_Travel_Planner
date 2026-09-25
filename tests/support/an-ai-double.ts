import type { AiReply, AiRequest, AiService } from '../../src/server/ai/ai-service';
import { AiUnavailableError } from '../../src/server/ai/ai-service';
import { aPlanReplyText } from './a-plan-reply';

export interface AiDouble extends AiService {
  readonly requests: readonly AiRequest[];
  /** The next requests are answered with this text, or with whatever the function returns. */
  replyWith(reply: string | ((request: AiRequest) => string)): void;
  failWith(error?: Error): void;
  /** The next requests never get an answer, until the caller's signal aborts. */
  neverAnswer(): void;
  /** The next requests throw from `complete` itself, before it can return a promise. */
  throwSynchronously(error: Error): void;
}

export const DOUBLE_INPUT_TOKENS = 1_000;
export const DOUBLE_OUTPUT_TOKENS = 2_000;

/** A stand-in for the AI: records what it was asked and answers with an 8-Day Plan unless told otherwise. */
export function anAiDouble(): AiDouble {
  const requests: AiRequest[] = [];
  let synchronousFailure: Error | null = null;
  let behaviour: (request: AiRequest) => Promise<AiReply> = async () => reply(aPlanReplyText({ dayCount: 8 }));

  return {
    get requests() {
      return [...requests];
    },
    replyWith(next) {
      behaviour = async (request) => reply(typeof next === 'string' ? next : next(request));
    },
    failWith(error = new AiUnavailableError()) {
      behaviour = async () => {
        throw error;
      };
    },
    neverAnswer() {
      behaviour = (request) =>
        new Promise<AiReply>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(new AiUnavailableError('aborted')));
        });
    },
    throwSynchronously(error) {
      synchronousFailure = error;
    },
    complete(request) {
      requests.push(request);
      if (synchronousFailure) throw synchronousFailure;
      return behaviour(request);
    },
  };
}

function reply(text: string): AiReply {
  return { text, inputTokens: DOUBLE_INPUT_TOKENS, outputTokens: DOUBLE_OUTPUT_TOKENS };
}
