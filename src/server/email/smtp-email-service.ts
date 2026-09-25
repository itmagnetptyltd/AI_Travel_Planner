import nodemailer from 'nodemailer';
import type { EmailMessage, EmailService } from './email-service';

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
  readonly from: string;
}

/** A mail server that has stopped answering is given up on after this long, not after nodemailer's own minutes. */
const SMTP_TIMEOUT_MS = 15_000;

export function createSmtpEmailService(settings: SmtpSettings): EmailService {
  const auth = settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined;
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    ...(auth ? { auth } : {}),
  });
  return {
    async send(message: EmailMessage): Promise<void> {
      await transport.sendMail({ from: settings.from, ...message });
    },
  };
}
