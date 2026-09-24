import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { PasswordProblem } from '../accounts/password-policy';

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/**
 * Parses a request body against a schema. On failure, replies 400 naming the
 * first offending field and nothing else.
 */
export async function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  reply: FastifyReply,
): Promise<Parsed<T>> {
  const result = schema.safeParse(body ?? {});
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const field = offendingField(result.error.issues[0]);
  await reply.code(400).send({ code: 'VALIDATION_FAILED', field, message: `${field} is not valid.` });
  return { ok: false };
}

function offendingField(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) {
    return 'body';
  }
  if (issue.code === 'unrecognized_keys') {
    return issue.keys[0] ?? 'body';
  }
  return issue.path.length > 0 ? issue.path.map(String).join('.') : 'body';
}

const PASSWORD_MESSAGES: Readonly<Record<PasswordProblem, string>> = {
  'too-short': 'Password must be at least 12 characters.',
  'too-long': 'Password must be at most 128 characters.',
  breached: 'This password has appeared in a data breach. Choose a different one.',
};

export async function replyInvalidPassword(reply: FastifyReply, problem: PasswordProblem): Promise<void> {
  await reply
    .code(400)
    .send({ code: 'VALIDATION_FAILED', field: 'password', message: PASSWORD_MESSAGES[problem] });
}

const TOKEN_MESSAGES = {
  expired: { status: 410, code: 'TOKEN_EXPIRED', message: 'This link has expired.' },
  used: { status: 410, code: 'TOKEN_USED', message: 'This link has already been used.' },
  invalid: { status: 400, code: 'TOKEN_INVALID', message: 'This link is not valid.' },
} as const;

export async function replyTokenRefused(
  reply: FastifyReply,
  error: keyof typeof TOKEN_MESSAGES,
): Promise<void> {
  const { status, code, message } = TOKEN_MESSAGES[error];
  await reply.code(status).send({ code, message });
}
