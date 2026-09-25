export interface EmailMessage {
  /** Stated by the application, once, for every message: callers cannot choose it (see `withSender`). */
  readonly from?: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Every email the application sends goes through this interface (ADR-0005). */
export interface EmailService {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Gives up on a send that has not finished in `ms`, so a mail service that stops answering cannot hold up the request
 * that wanted the email, or the reminder check that is sending one. The send itself may still finish later.
 */
export function withSendTimeout(inner: EmailService, ms: number): EmailService {
  return {
    async send(message) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tooSlow = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Sending the email took longer than ${ms} ms.`)), ms);
      });
      try {
        await Promise.race([inner.send(message), tooSlow]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Puts the configured sender on every message, whatever the message says, so nothing is ever sent as someone else. */
export function withSender(inner: EmailService, from: string): EmailService {
  return { send: (message) => inner.send({ ...message, from }) };
}
