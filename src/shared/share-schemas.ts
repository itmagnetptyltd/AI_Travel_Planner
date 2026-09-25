import { z } from 'zod';
import type { PlanEstimates } from './trip-budget';
import type { PlanView, StaySummary } from './plan-schemas';

/** ANSWERS.md, "What an emailed or shared Plan contains": at most 10 recipients per Trip per day. */
export const SHARE_DAILY_LIMIT = 10;

/** ANSWERS.md, "What an emailed or shared Plan contains": a link expires after 30 days. */
export const SHARE_LINK_DAYS = 30;

const MAX_EMAIL_LENGTH = 254;

/** An address to share with. Spaces round it are ignored and the case is folded; anything that is not an address is refused. */
export const recipientSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL_LENGTH)
  .pipe(z.email())
  .transform((address) => address.toLowerCase());

export const shareRequestSchema = z.object({ recipient: recipientSchema }).strict();

export const SHARE_LIMIT_REACHED = 'SHARE_LIMIT_REACHED';
export const SHARE_NOT_FOUND = 'SHARE_NOT_FOUND';
export const SHARE_EXPIRED = 'SHARE_EXPIRED';
export const EMAIL_FAILED = 'EMAIL_FAILED';

export const EMAIL_FAILED_MESSAGE = 'The email could not be sent. Nothing was shared. Try again.';
export const SHARE_NOT_FOUND_MESSAGE = 'This link is not valid.';
export const SHARE_EXPIRED_MESSAGE = 'This link has expired.';

/** A link to a Trip's read-only Plan, as its owner sees it in the list. The token itself is never shown again. */
export interface ShareSummary {
  readonly id: string;
  /** Null for the link in the Traveler's own Plan email. */
  readonly recipient: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly isRevoked: boolean;
}

export interface SharedActivity {
  readonly startTime: string;
  readonly title: string;
  readonly durationMinutes: number;
  readonly estimatedCost: number;
  readonly location: string;
  readonly reason: string;
  readonly category: string;
}

export interface SharedDay {
  readonly dayNumber: number;
  readonly date: string;
  readonly activities: readonly SharedActivity[];
}

/**
 * What anyone holding a valid link sees: the Trip and its Plan and nothing that identifies a person or another record
 * (no ids, no account, no email address, no chat).
 */
export interface SharedPlanView {
  readonly trip: {
    readonly name: string;
    readonly destination: { readonly name: string; readonly country: string };
    readonly startDate: string;
    readonly endDate: string;
  };
  readonly plan: { readonly currency: PlanView['currency']; readonly days: readonly SharedDay[]; readonly stay: StaySummary };
  readonly estimates: PlanEstimates;
  readonly notice: string;
  readonly expiresAt: string;
}
