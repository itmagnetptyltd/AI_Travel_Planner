import { z } from 'zod';
import { CURRENCIES, type Currency } from './currencies';

/** Matches the six budget categories of REQ-TRV-049; the sixth, accommodation, is the stay summary. */
export const ACTIVITY_CATEGORIES = ['Food', 'Transportation', 'Activities', 'Shopping', 'Other'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** One suggested item on a Day. `startTime` is 24-hour `HH:MM`; `estimatedCost` is whole units of the Trip's currency. */
export interface PlanActivity {
  readonly title: string;
  readonly startTime: string;
  readonly durationMinutes: number;
  readonly estimatedCost: number;
  readonly location: string;
  readonly reason: string;
  readonly category: ActivityCategory;
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

/** A generated Plan as the Web API returns it. */
export interface PlanView {
  readonly currency: Currency;
  readonly days: readonly PlanDay[];
  readonly stay: StaySummary;
}

export const PLAN_LIMIT_REACHED = 'PLAN_LIMIT_REACHED';
export const AI_UNAVAILABLE = 'AI_UNAVAILABLE';
export const PLAN_NOT_FOUND = 'PLAN_NOT_FOUND';
export const TRIP_CHANGED = 'TRIP_CHANGED';
export const PLAN_VERSION_NOT_FOUND = 'PLAN_VERSION_NOT_FOUND';

export const AI_UNAVAILABLE_MESSAGE =
  'The AI planner is unavailable right now. Your Trip is unchanged. Please try again later.';

/** A Trip keeps at most this many Plan versions; the oldest goes first (ANSWERS.md, "One Plan per Trip"). */
export const MAX_PLAN_VERSIONS = 10;

/** Where a Plan version came from. Later slices add edit, regeneration and chat. */
export const PLAN_VERSION_SOURCES = ['generation', 'restore'] as const;
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
});
