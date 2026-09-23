import type { EmailMessage, EmailService } from '../../src/server/email/email-service';

export interface CapturingEmailService extends EmailService {
  readonly sent: readonly EmailMessage[];
  sentTo(address: string): readonly EmailMessage[];
}

export function aCapturingEmailService(): CapturingEmailService {
  const sent: EmailMessage[] = [];
  return {
    get sent() {
      return [...sent];
    },
    sentTo: (address) => sent.filter((message) => message.to === address),
    async send(message) {
      sent.push(message);
    },
  };
}

/** Pulls the first http(s) link out of an email body. */
export function linkIn(message: EmailMessage | undefined): URL {
  const match = message?.text.match(/https?:\/\/\S+/);
  if (!match) {
    throw new Error('No link found in the email');
  }
  return new URL(match[0]);
}
