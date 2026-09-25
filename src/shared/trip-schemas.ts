import { z } from 'zod';
import { CURRENCIES, type Currency } from './currencies';
import { TRAVEL_STYLES, type TravelStyle } from './travel-styles';

/** The longest Trip the client agreed (ANSWERS.md, "Trip length and past dates"). */
export const TRIP_MAX_DAYS = 14;

/** Safety limits the criteria do not give; the client is still to confirm them. */
export const TRIP_LIMITS = Object.freeze({
  name: 100,
  maxAdults: 20,
  maxChildren: 20,
  maxBudget: 10_000_000,
  maxTravelStyles: 3,
});

export const TRIP_STATUSES = ['Draft', 'Planned'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days from start to end, counting both. Both are ISO calendar dates. */
export function tripDayCount(startDate: string, endDate: string): number {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1;
}

/** Whether a start and end date make a Trip; a problem is always reported on the end date. */
export function areTripDatesValid(startDate: string, endDate: string): boolean {
  const days = tripDayCount(startDate, endDate);
  return days >= 1 && days <= TRIP_MAX_DAYS;
}

const tripFields = {
  name: z.string().trim().min(1).max(TRIP_LIMITS.name),
  destinationId: z.string().min(1),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  adults: z.number().int().min(1).max(TRIP_LIMITS.maxAdults),
  children: z.number().int().min(0).max(TRIP_LIMITS.maxChildren).optional(),
  budget: z.number().int().min(0).max(TRIP_LIMITS.maxBudget),
  currency: z.enum(CURRENCIES),
  travelStyles: z.array(z.enum(TRAVEL_STYLES)).max(TRIP_LIMITS.maxTravelStyles).optional(),
  // Accepted so a caller who sends it is not refused, and never read: the number of
  // travelers is always adults plus children (ANSWERS.md, "Number of travelers").
  numberOfTravelers: z.unknown().optional(),
};

export const tripInputSchema = z
  .object(tripFields)
  .strict()
  .superRefine((trip, context) => {
    if (!areTripDatesValid(trip.startDate, trip.endDate)) {
      context.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate is not valid.' });
    }
  });

/** Any subset of the Trip details. The dates are checked against the saved Trip by the service. */
export const tripUpdateSchema = z.object(tripFields).partial().strict();

export type TripInput = z.input<typeof tripInputSchema>;
export type TripUpdate = z.input<typeof tripUpdateSchema>;

/** A Trip as the Web API returns it. */
export interface TripView {
  readonly id: string;
  readonly name: string;
  readonly destination: { readonly id: string; readonly name: string; readonly country: string };
  readonly startDate: string;
  readonly endDate: string;
  readonly dayCount: number;
  readonly adults: number;
  readonly children: number;
  readonly numberOfTravelers: number;
  readonly budget: number;
  readonly currency: Currency;
  readonly travelStyles: readonly TravelStyle[];
  readonly status: TripStatus;
}
