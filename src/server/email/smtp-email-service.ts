import nodemailer from 'nodemailer';
import type { EmailMessage, EmailService } from './email-service';

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
  readonly from: string;
}

export function createSmtpEmailService(settings: SmtpSettings): EmailService {
  const auth = settings.user ? { user: settings.user, pass: settings.password ?? '' } : undefined;
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    ...(auth ? { auth } : {}),
  });
  return {
    async send(message: EmailMessage): Promise<void> {
      await transport.sendMail({ from: settings.from, ...message });
    },
  };
}
