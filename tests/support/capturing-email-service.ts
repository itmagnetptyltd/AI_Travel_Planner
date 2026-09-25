import type { EmailMessage, EmailService } from '../../src/server/email/email-service';

export interface CapturingEmailService extends EmailService {
  readonly sent: readonly EmailMessage[];
  sentTo(address: string): readonly EmailMessage[];
  /** Makes every send fail until told otherwise, as a mail service that is down does. */
  setDown(isDown: boolean): void;
  /** Makes every send wait for ever, as a mail service that has stopped answering does. */
  setHung(isHung: boolean): void;
}

export function aCapturingEmailService(): CapturingEmailService {
  const sent: EmailMessage[] = [];
  let isDown = false;
  let isHung = false;
  return {
    get sent() {
      return [...sent];
    },
    sentTo: (address) => sent.filter((message) => message.to === address),
    setDown(down) {
      isDown = down;
    },
    setHung(hung) {
      isHung = hung;
    },
    async send(message) {
      if (isHung) await new Promise<never>(() => undefined);
      if (isDown) throw new Error('The mail service is down.');
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
