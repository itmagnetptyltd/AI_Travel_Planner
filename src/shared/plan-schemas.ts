import { z } from 'zod';
import { CURRENCIES, type Currency } from './currencies';

/** Matches the six budget categories of REQ-TRV-049; the sixth, accommodation, is the stay summary. */
export const ACTIVITY_CATEGORIES = ['Food', 'Transportation', 'Activities', 'Shopping', 'Other'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/**
 * One suggested item on a Day. `startTime` is 24-hour `HH:MM`; `estimatedCost` is whole units of the Trip's currency.
 * `id` is how an edit says which Activity it means, and `changedByHand` records that the Traveler, not the AI, wrote
 * or moved it, which is what regenerating warns about (REQ-TRV-041).
 */
export interface PlanActivity {
  readonly id: string;
  readonly title: string;
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly estimatedCost: number;
  readonly location: string;
  readonly reason: string;
  readonly category: ActivityCategory;
  readonly changedByHand: boolean;
}

export interface PlanDay {
  readonly dayNumber: number;
  /** The calendar date, `YYYY-MM-DD`, assigned by the server from the Trip's start date. */
  readonly date: string;
  readonly activities: readonly PlanActivity[];
}

/** Accommodation is shown once for the Trip, never as an Activity on a Day. */
export interface StaySummary {
  readonly accommodationType: string;
  readonly suggestedArea: string;
  readonly nightlyCostEstimate: number;
}

/** Who the Plan was made for, so a later change to them can be noticed (REQ-TRV-098). Absent on a Plan saved before this was kept. */
export interface PlanBasis {
  readonly adults: number;
  readonly children: number;
  readonly budget: number;
}

/** A generated Plan as the Web API returns it. */
export interface PlanView {
  readonly currency: Currency;
  readonly days: readonly PlanDay[];
  readonly stay: StaySummary;
  readonly basis?: PlanBasis;
}

export const PLAN_LIMIT_REACHED = 'PLAN_LIMIT_REACHED';
export const AI_UNAVAILABLE = 'AI_UNAVAILABLE';
export const PLAN_NOT_FOUND = 'PLAN_NOT_FOUND';
export const TRIP_CHANGED = 'TRIP_CHANGED';
export const PLAN_VERSION_NOT_FOUND = 'PLAN_VERSION_NOT_FOUND';
export const DAY_NOT_FOUND = 'DAY_NOT_FOUND';
/** Changing the Trip would replace or shorten its Plan; the request must say the Traveler agrees (REQ-TRV-098). */
export const PLAN_CHANGE_NEEDS_CONFIRMATION = 'PLAN_CHANGE_NEEDS_CONFIRMATION';
export const ACTIVITY_NOT_FOUND = 'ACTIVITY_NOT_FOUND';
/** Regenerating would replace Activities the Traveler changed by hand; the request must say they agree (REQ-TRV-041). */
export const EDITS_WOULD_BE_REPLACED = 'EDITS_WOULD_BE_REPLACED';

export const AI_UNAVAILABLE_MESSAGE =
  'The AI planner is unavailable right now. Your Trip is unchanged. Please try again later.';

/** What changing a Trip does to its Plan that the Traveler must agree to first (REQ-TRV-098). */
export type WarnedPlanEffect =
  | { readonly kind: 'regenerate' }
  | { readonly kind: 'drop-days'; readonly droppedDays: readonly number[] };

/** A Trip keeps at most this many Plan versions; the oldest goes first (ANSWERS.md, "One Plan per Trip"). */
export const MAX_PLAN_VERSIONS = 10;

/** Where a Plan version came from. */
export const PLAN_VERSION_SOURCES = ['generation', 'restore', 'edit', 'day-regeneration', 'trip-change', 'chat'] as const;
export type PlanVersionSource = (typeof PLAN_VERSION_SOURCES)[number];

/** A saved Plan, as the Web API returns it: the Plan itself and which version it is. */
export interface SavedPlan extends PlanView {
  readonly version: number;
  readonly createdAt: string;
  readonly source: PlanVersionSource;
}

export interface PlanVersionSummary {
  readonly version: number;
  readonly createdAt: string;
  readonly source: PlanVersionSource;
}

const activitySchema = z.object({
  // Plans saved before Activities had ids have neither field; the store fills them in as it reads.
  id: z.string().optional(),
  changedByHand: z.boolean().default(false),
  title: z.string(),
  startTime: z.string(),
  durationMinutes: z.number(),
  estimatedCost: z.number(),
  location: z.string(),
  reason: z.string(),
  category: z.enum(ACTIVITY_CATEGORIES),
});

/** What a stored Plan snapshot must look like when it is read back. */
export const planViewSchema = z.object({
  currency: z.enum(CURRENCIES),
  days: z.array(z.object({ dayNumber: z.number(), date: z.string(), activities: z.array(activitySchema) })),
  stay: z.object({ accommodationType: z.string(), suggestedArea: z.string(), nightlyCostEstimate: z.number() }),
  basis: z.object({ adults: z.number(), children: z.number(), budget: z.number() }).optional(),
});
