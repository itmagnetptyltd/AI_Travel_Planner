import type { Currency } from './currencies';

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

export const AI_UNAVAILABLE_MESSAGE =
  'The AI planner is unavailable right now. Your Trip is unchanged. Please try again later.';
