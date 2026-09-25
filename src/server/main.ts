import { resolve } from 'node:path';
import { buildApp } from './app';
import { createAnthropicAiService } from './ai/anthropic-ai-service';
import type { AiService } from './ai/ai-service';
import { createScriptedAiService } from './ai/scripted-ai-service';
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

function aiServiceFor(config: AppConfig): AiService {
  if (config.AI_PROVIDER === 'scripted') {
    return createScriptedAiService(config.AI_SCRIPT_FILE ?? '');
  }
  return createAnthropicAiService({ apiKey: config.AI_API_KEY ?? '', model: config.AI_MODEL ?? '' });
}

const config = loadConfig(process.env);
const { db } = openDatabase(config.DATABASE_PATH);
const app = await buildApp({
  db,
  clock: systemClock,
  email: emailServiceFor(config),
  ai: aiServiceFor(config),
  planSettings: {
    timeoutMs: config.AI_TIMEOUT_MS,
    destinationTextMaxChars: config.AI_DESTINATION_TEXT_MAX_CHARS,
    maxOutputTokens: config.AI_MAX_OUTPUT_TOKENS,
    inputCostMicroUsdPerMTok: config.AI_INPUT_COST_MICRO_USD_PER_MTOK ?? 0,
    outputCostMicroUsdPerMTok: config.AI_OUTPUT_COST_MICRO_USD_PER_MTOK ?? 0,
  },
  breachedPasswords: loadBundledBreachedPasswordChecker(),
  appBaseUrl: config.APP_BASE_URL,
  cookieSecure: config.COOKIE_SECURE,
  authRateLimitPerMinute: config.AUTH_RATE_LIMIT_PER_MINUTE,
  webRoot: resolve('dist/web'),
  logger: true,
});
await app.listen({ port: config.PORT, host: config.HOST });
