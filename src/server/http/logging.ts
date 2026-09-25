import type { FastifyLoggerOptions, FastifyServerOptions } from 'fastify';

/**
 * The address of a shared Plan holds its token, which is a password to that Plan. It is hidden before an address is
 * logged, so a copy of the log opens nothing (REQ-TRV-058). Every other address is logged as it is.
 */
export const redactSecretsInUrl = (url: string): string => url.replace(/^(\/(?:api\/)?shared\/)[^/?#]+/, '$1[redacted]');

export interface LoggingSettings {
  readonly logger?: boolean;
  /** Where log lines go instead of the process's output. Given only by tests, to read what the server said. */
  readonly logStream?: { write(line: string): void };
}

/** What Fastify logs about a request: the method, the address with secrets hidden, and who asked. */
const serializers: NonNullable<FastifyLoggerOptions['serializers']> = {
  req: (request) => ({
    method: request.method,
    url: redactSecretsInUrl(request.url),
    host: request.host,
    remoteAddress: request.ip,
  }),
};

export function loggerFor(settings: LoggingSettings): NonNullable<FastifyServerOptions['logger']> {
  if (!settings.logger) return false;
  return settings.logStream ? { serializers, stream: settings.logStream } : { serializers };
}
