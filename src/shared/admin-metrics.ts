import { z } from 'zod';
import type { Currency } from './currencies';

/** The most Destinations the dashboard lists (ANSWERS.md, "Dashboard metrics": top 10). */
export const POPULAR_DESTINATIONS_LIMIT = 10;

export interface AdminMetrics {
  /** Every Traveler account, confirmed or not, enabled or not. Administrators are not users here. */
  readonly users: number;
  /** Trips that are not deleted. */
  readonly trips: { readonly total: number; readonly draft: number; readonly planned: number };
  /** Successful whole-Plan generations, which a Trip's saved versions cannot count: they are pruned, and go with the Trip. */
  readonly generatedItineraries: number;
  readonly popularDestinations: readonly { readonly name: string; readonly country: string; readonly trips: number }[];
  /** One figure for each currency, never combined, rounded to a whole unit. */
  readonly averageBudget: readonly { readonly currency: Currency; readonly amount: number }[];
  /** The average is to one decimal, and none when there is no feedback. */
  readonly feedback: { readonly count: number; readonly averageRating: number | null };
  /** Over the chosen dates, or all time when none are chosen. The cost is in US dollars. */
  readonly aiUsage: { readonly requests: number; readonly estimatedCost: number; readonly from: string | null; readonly to: string | null };
}

/** The dates the dashboard's AI usage covers, both included, as UTC calendar dates. A blank one is one not given. */
export interface MetricsRange {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

const optionalDate = z.preprocess((value) => (value === '' ? undefined : value), z.iso.date().optional());

export const metricsRangeSchema = z
  .object({ from: optionalDate, to: optionalDate })
  .strict()
  .superRefine((range, context) => {
    if (range.from !== undefined && range.to !== undefined && range.from > range.to) {
      context.addIssue({ code: 'custom', path: ['to'], message: 'The end of the range is before its start.' });
    }
  });
