export interface AiRequest {
  readonly system: string;
  readonly user: string;
  readonly maxOutputTokens: number;
  readonly signal: AbortSignal;
}

export interface AiReply {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Every call to an AI provider goes through this interface (REQ-TRV-081). It carries text,
 * not structure: the same text a test double receives is what REQ-TRV-034 stores.
 */
export interface AiService {
  complete(request: AiRequest): Promise<AiReply>;
}

/** The only failure an adapter may throw. Its message never carries request text or a key. */
export class AiUnavailableError extends Error {
  constructor(message = 'The AI service is unavailable.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export function requestTextOf(request: Pick<AiRequest, 'system' | 'user'>): string {
  return `${request.system}\n\n${request.user}`;
}
