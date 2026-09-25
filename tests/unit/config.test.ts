import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/server/config';

const KEY = 'sk-ant-config-test-key'; // itm-sdlc:allow-secret - synthetic test key

const BASE = {
  APP_BASE_URL: 'https://trv.example.test',
  DATABASE_PATH: 'data/test.sqlite',
  EMAIL_TRANSPORT: 'file',
  EMAIL_OUTBOX_DIR: '.outbox',
  EMAIL_FROM: 'no-reply@example.test',
  APP_ENV: 'production',
  APP_TIMEZONE: 'Australia/Sydney',
};

const ANTHROPIC = {
  ...BASE,
  AI_PROVIDER: 'anthropic',
  AI_API_KEY: KEY,
  AI_MODEL: 'a-model',
  AI_INPUT_COST_MICRO_USD_PER_MTOK: '5000000',
  AI_OUTPUT_COST_MICRO_USD_PER_MTOK: '25000000',
};

const SCRIPTED = { ...BASE, AI_PROVIDER: 'scripted', AI_SCRIPT_FILE: '.e2e/ai-script.json' };

const without = (env: Record<string, string>, name: string): Record<string, string> =>
  Object.fromEntries(Object.entries(env).filter(([key]) => key !== name));

function problemsWith(env: Record<string, string>): string {
  try {
    loadConfig(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

describe('the AI settings at startup', () => {
  // @covers REQ-TRV-026@v1
  test('reads the provider, key, model, cost rates and the limits the client asked to be configurable', () => {
    const config = loadConfig({ ...ANTHROPIC, AI_TIMEOUT_MS: '90000', AI_DESTINATION_TEXT_MAX_CHARS: '500' });

    expect(config).toMatchObject({
      AI_PROVIDER: 'anthropic',
      AI_API_KEY: KEY,
      AI_MODEL: 'a-model',
      AI_TIMEOUT_MS: 90_000,
      AI_DESTINATION_TEXT_MAX_CHARS: 500,
      AI_INPUT_COST_MICRO_USD_PER_MTOK: 5_000_000,
      AI_OUTPUT_COST_MICRO_USD_PER_MTOK: 25_000_000,
    });
  });

  // @covers REQ-TRV-026@v1
  test('defaults the timeout to 120 seconds, the destination text limit to 2000 characters and the output cap to 16000 tokens', () => {
    expect(loadConfig(ANTHROPIC)).toMatchObject({
      AI_TIMEOUT_MS: 120_000,
      AI_DESTINATION_TEXT_MAX_CHARS: 2_000,
      AI_MAX_OUTPUT_TOKENS: 16_000,
    });
  });

  // @covers REQ-TRV-026@v1
  test.each(['AI_API_KEY', 'AI_MODEL', 'AI_INPUT_COST_MICRO_USD_PER_MTOK', 'AI_OUTPUT_COST_MICRO_USD_PER_MTOK'])(
    'refuses to start without %s when the provider is anthropic, naming it and never the key',
    (name) => {
      const message = problemsWith(without(ANTHROPIC, name));

      expect(message).toContain(name);
      expect(message).not.toContain(KEY);
    },
  );

  // @covers REQ-TRV-026@v1
  test('refuses to start without a provider', () => {
    expect(problemsWith(BASE)).toContain('AI_PROVIDER');
  });

  // @covers REQ-TRV-026@v1
  test('refuses to start with the scripted provider and no script file', () => {
    expect(problemsWith(without(SCRIPTED, 'AI_SCRIPT_FILE'))).toContain('AI_SCRIPT_FILE');
  });

  // @covers REQ-TRV-026@v1
  test.each([undefined, 'production', 'development'])(
    'refuses to start with the scripted provider when NODE_ENV is %s',
    (nodeEnv) => {
      const env = nodeEnv === undefined ? SCRIPTED : { ...SCRIPTED, NODE_ENV: nodeEnv };

      expect(problemsWith(env)).toContain('AI_PROVIDER');
    },
  );

  // @covers REQ-TRV-026@v1
  test('starts with the scripted provider only when NODE_ENV is test, and needs no key', () => {
    expect(loadConfig({ ...SCRIPTED, NODE_ENV: 'test' })).toMatchObject({ AI_PROVIDER: 'scripted' });
  });
});

const DEVELOPMENT = { ...SCRIPTED, NODE_ENV: 'test', APP_ENV: 'development' };

describe('the mail settings in development', () => {
  // @covers REQ-TRV-054@v1
  test('accept a file outbox, which no real mail service ever sees', () => {
    expect(loadConfig(DEVELOPMENT)).toMatchObject({ APP_ENV: 'development', EMAIL_TRANSPORT: 'file' });
  });

  // @covers REQ-TRV-054@v1
  test.each(['127.0.0.1', 'localhost'])('accept SMTP to %s, where a test inbox such as Mailpit listens', (host) => {
    const env = { ...DEVELOPMENT, EMAIL_TRANSPORT: 'smtp', SMTP_HOST: host, SMTP_PORT: '1025' };

    expect(loadConfig(env)).toMatchObject({ EMAIL_TRANSPORT: 'smtp', SMTP_HOST: host });
  });

  // @covers REQ-TRV-054@v1
  test.each(['smtp.sendgrid.net', 'email-smtp.ap-southeast-2.amazonaws.com', '10.0.0.5', 'localhost.evil.example'])(
    'refuse to start with SMTP to %s, so development mail is never handed to a transactional service',
    (host) => {
      const message = problemsWith({ ...DEVELOPMENT, EMAIL_TRANSPORT: 'smtp', SMTP_HOST: host, SMTP_PORT: '587' });

      expect(message).toContain('SMTP_HOST');
      expect(message).toMatch(/development/i);
    },
  );

  // @covers REQ-TRV-054@v1
  test('leave production free to use any SMTP host', () => {
    const env = { ...BASE, AI_PROVIDER: 'anthropic', AI_API_KEY: KEY, AI_MODEL: 'a-model', AI_INPUT_COST_MICRO_USD_PER_MTOK: '1', AI_OUTPUT_COST_MICRO_USD_PER_MTOK: '1' };

    expect(loadConfig({ ...env, EMAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.sendgrid.net' })).toMatchObject({ SMTP_HOST: 'smtp.sendgrid.net' });
  });

  // @covers REQ-TRV-054@v1
  test('require APP_ENV to be development or production, naming the setting', () => {
    expect(problemsWith(without(ANTHROPIC, 'APP_ENV'))).toContain('APP_ENV');
    expect(problemsWith({ ...ANTHROPIC, APP_ENV: 'staging' })).toContain('APP_ENV');
  });
});

describe('the timezone and the reminder check', () => {
  // @covers REQ-TRV-057@v1
  test('read the configured timezone', () => {
    expect(loadConfig({ ...ANTHROPIC, APP_TIMEZONE: 'America/Los_Angeles' })).toMatchObject({ APP_TIMEZONE: 'America/Los_Angeles' });
  });

  // @covers REQ-TRV-057@v1
  test('refuse to start without a timezone, or with one that does not exist, naming the setting', () => {
    expect(problemsWith(without(ANTHROPIC, 'APP_TIMEZONE'))).toContain('APP_TIMEZONE');
    expect(problemsWith({ ...ANTHROPIC, APP_TIMEZONE: 'Mars/Olympus' })).toContain('APP_TIMEZONE');
  });

  // @covers REQ-TRV-057@v1
  test('check for due reminders every 15 minutes unless told otherwise', () => {
    expect(loadConfig(ANTHROPIC).REMINDER_CHECK_INTERVAL_MS).toBe(900_000);
    expect(loadConfig({ ...ANTHROPIC, REMINDER_CHECK_INTERVAL_MS: '1000' }).REMINDER_CHECK_INTERVAL_MS).toBe(1000);
  });
});

describe('the public address in production', () => {
  // @covers REQ-TRV-057@v1
  test('must be https, so the links in emails are, and the setting is named', () => {
    const message = problemsWith({ ...ANTHROPIC, APP_BASE_URL: 'http://trv.example.test' });

    expect(message).toContain('APP_BASE_URL');
    expect(message).toMatch(/https/);
  });

  // @covers REQ-TRV-057@v1
  test('may be plain http in development, where the application runs on the developer’s own machine', () => {
    expect(loadConfig({ ...DEVELOPMENT, APP_BASE_URL: 'http://127.0.0.1:3000' })).toMatchObject({ APP_BASE_URL: 'http://127.0.0.1:3000' });
  });
});
