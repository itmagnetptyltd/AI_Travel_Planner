import { z } from 'zod';

/** ANSWERS.md, "Limits on AI use": per Traveler, per calendar day. An Administrator can change it. */
export const DEFAULT_DAILY_PLAN_GENERATION_LIMIT = 20;
export const MAX_DAILY_PLAN_GENERATION_LIMIT = 1000;

/** ANSWERS.md, "Storing AI requests and replies": text is deleted after 30 days; counts and cost stay. */
export const AI_TEXT_RETENTION_DAYS = 30;

/** The requests that count toward the per-day limit on Plan generations, regenerations and suggestions. */
export const PLAN_LIMIT_KINDS = ['plan-generation', 'day-regeneration', 'activity-suggestion'] as const;

/** Chat messages have a limit of their own (ANSWERS.md, "Limits on AI use": 100 a day). */
export const CHAT_LIMIT_KINDS = ['chat'] as const;
export const DEFAULT_DAILY_CHAT_LIMIT = 100;

export const AI_REQUEST_KINDS = [...PLAN_LIMIT_KINDS, ...CHAT_LIMIT_KINDS] as const;
export type AiRequestKind = (typeof AI_REQUEST_KINDS)[number];

/** What an Administrator sends to change the limits (REQ-TRV-091). The chat limit has a setting but no admin screen yet. */
export const aiUsageLimitsSchema = z
  .object({ dailyPlanGenerationLimit: z.number().int().min(1).max(MAX_DAILY_PLAN_GENERATION_LIMIT) })
  .strict();

export type AiUsageLimits = z.infer<typeof aiUsageLimitsSchema>;

export const AI_REQUEST_STATUSES = ['pending', 'succeeded', 'failed'] as const;
export type AiRequestStatus = (typeof AI_REQUEST_STATUSES)[number];

/** A stored AI request as the admin API lists it: counts and cost, never text. */
export interface AiRequestSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly kind: AiRequestKind;
  readonly status: AiRequestStatus;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicroUsd: number;
}

export interface AiRequestDetail extends AiRequestSummary {
  /** Null once the record is older than the retention period. */
  readonly requestText: string | null;
  readonly replyText: string | null;
}
