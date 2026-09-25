export interface MailFailure {
  readonly code?: string;
  readonly responseCode?: number;
  readonly command?: string;
}

const MAIL_FAILURE_FIELDS = ['command', 'responseCode', 'rejected', 'envelope'] as const;

/** Whether an error came from a mail service. Those carry the addresses the mail was for, which a log must not hold. */
export function isMailFailure(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && MAIL_FAILURE_FIELDS.some((field) => field in cause);
}

/**
 * What a log may say about a failed send: the kind of failure and its codes. A mail service reports back the addresses
 * it refused and the reply it was given, which are other people's personal details, so none of that is kept.
 */
export function describeMailFailure(cause: unknown): MailFailure {
  if (typeof cause !== 'object' || cause === null) return {};
  const { code, responseCode, command } = cause as { code?: unknown; responseCode?: unknown; command?: unknown };
  return {
    ...(typeof code === 'string' ? { code } : {}),
    ...(typeof responseCode === 'number' ? { responseCode } : {}),
    ...(typeof command === 'string' ? { command } : {}),
  };
}

/** An error as it should be logged: a mail failure by its codes alone, anything else as it is. */
export const loggableFailure = (cause: unknown): unknown => (isMailFailure(cause) ? describeMailFailure(cause) : cause);
