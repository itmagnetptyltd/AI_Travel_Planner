import { describe, expect, test } from 'vitest';
import { loadConfig } from '../../src/server/config';

const KEY = 'sk-ant-config-test-key'; // itm-sdlc:allow-secret - synthetic test key

const BASE = {
  APP_BASE_URL: 'http://127.0.0.1:3000',
  DATABASE_PATH: 'data/test.sqlite',
  EMAIL_TRANSPORT: 'file',
  EMAIL_OUTBOX_DIR: '.outbox',
  EMAIL_FROM: 'no-reply@example.test',
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
