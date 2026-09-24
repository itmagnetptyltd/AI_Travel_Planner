import { resolve } from 'node:path';
import { buildApp } from './app';
import { systemClock } from './clock';
import { loadConfig, type AppConfig } from './config';
import { openDatabase } from './db/client';
import type { EmailService } from './email/email-service';
import { createFileEmailService } from './email/file-email-service';
import { createSmtpEmailService } from './email/smtp-email-service';
import { loadBundledBreachedPasswordChecker } from './accounts/breached-password-checker';

function emailServiceFor(config: AppConfig): EmailService {
  if (config.EMAIL_TRANSPORT === 'file') {
    return createFileEmailService(config.EMAIL_OUTBOX_DIR ?? '');
  }
  return createSmtpEmailService({
    host: config.SMTP_HOST ?? '',
    port: config.SMTP_PORT ?? 25,
    user: config.SMTP_USER,
    password: config.SMTP_PASSWORD,
    from: config.EMAIL_FROM,
  });
}

const config = loadConfig(process.env);
const { db } = openDatabase(config.DATABASE_PATH);
const app = await buildApp({
  db,
  clock: systemClock,
  email: emailServiceFor(config),
  breachedPasswords: loadBundledBreachedPasswordChecker(),
  appBaseUrl: config.APP_BASE_URL,
  cookieSecure: config.COOKIE_SECURE,
  authRateLimitPerMinute: config.AUTH_RATE_LIMIT_PER_MINUTE,
  webRoot: resolve('dist/web'),
  logger: true,
});
await app.listen({ port: config.PORT, host: config.HOST });
