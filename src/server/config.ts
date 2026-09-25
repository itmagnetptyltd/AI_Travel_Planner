import { z } from 'zod';

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');

const configSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().min(1).default('127.0.0.1'),
    APP_BASE_URL: z.url(),
    DATABASE_PATH: z.string().min(1),
    EMAIL_TRANSPORT: z.enum(['smtp', 'file']),
    EMAIL_FROM: z.email(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    EMAIL_OUTBOX_DIR: z.string().optional(),
    COOKIE_SECURE: booleanFromString.default(true),
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
    NODE_ENV: z.string().optional(),
    AI_PROVIDER: z.enum(['anthropic', 'scripted']),
    AI_API_KEY: z.string().min(1).optional(),
    AI_MODEL: z.string().min(1).optional(),
    AI_SCRIPT_FILE: z.string().min(1).optional(),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(16_000),
    AI_DESTINATION_TEXT_MAX_CHARS: z.coerce.number().int().positive().default(2_000),
    AI_INPUT_COST_MICRO_USD_PER_MTOK: z.coerce.number().int().nonnegative().optional(),
    AI_OUTPUT_COST_MICRO_USD_PER_MTOK: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.EMAIL_TRANSPORT === 'smtp' && !value.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'required when EMAIL_TRANSPORT=smtp' });
    }
    if (value.EMAIL_TRANSPORT === 'file' && !value.EMAIL_OUTBOX_DIR) {
      ctx.addIssue({ code: 'custom', path: ['EMAIL_OUTBOX_DIR'], message: 'required when EMAIL_TRANSPORT=file' });
    }
    if (value.AI_PROVIDER === 'anthropic') {
      for (const name of ['AI_API_KEY', 'AI_MODEL', 'AI_INPUT_COST_MICRO_USD_PER_MTOK', 'AI_OUTPUT_COST_MICRO_USD_PER_MTOK'] as const) {
        if (value[name] === undefined) {
          ctx.addIssue({ code: 'custom', path: [name], message: 'required when AI_PROVIDER=anthropic' });
        }
      }
    }
    if (value.AI_PROVIDER === 'scripted') {
      if (!value.AI_SCRIPT_FILE) {
        ctx.addIssue({ code: 'custom', path: ['AI_SCRIPT_FILE'], message: 'required when AI_PROVIDER=scripted' });
      }
      if (value.NODE_ENV !== 'test') {
        ctx.addIssue({ code: 'custom', path: ['AI_PROVIDER'], message: 'scripted is for tests and needs NODE_ENV=test' });
      }
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Reads and validates the environment once. Throws, naming every missing or
 * invalid variable (never its value), so the service refuses to start.
 */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration: ${problems.join('; ')}`);
  }
  return result.data;
}
