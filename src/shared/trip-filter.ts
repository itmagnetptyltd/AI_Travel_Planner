import { z } from 'zod';
import { CURRENCIES, type Currency } from './currencies';
import { TRAVEL_STYLES, type TravelStyle } from './travel-styles';
import type { TripView } from './trip-schemas';

/** What a Traveler can search and filter their own Trips by. Every condition given must match; one left out matches every Trip. */
export interface TripFilter {
  /** Matches the Trip's name, or its Destination's name or country, anywhere in it and ignoring capitals. */
  readonly search?: string | undefined;
  /** A Destination id. */
  readonly destination?: string | undefined;
  readonly country?: string | undefined;
  /** A Trip matches if this is one of its (up to three) travel styles. */
  readonly style?: TravelStyle | undefined;
  /** Budgets are not converted between currencies, so a budget range is always in one currency. */
  readonly currency?: Currency | undefined;
  readonly minBudget?: number | undefined;
  readonly maxBudget?: number | undefined;
  /** Both ends are included: a minimum of 6 Days keeps a 6-Day Trip. */
  readonly minDays?: number | undefined;
  readonly maxDays?: number | undefined;
}

const SEARCH_MAX_CHARS = 100;
const wholeNumber = z.string().regex(/^\d{1,9}$/).transform(Number);

/** A parameter that was sent blank is the same as one not sent, whichever filter it is. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** The filters as they arrive in a query string: text, read into numbers, and refused naming the field when they are not right. */
export const tripFilterSchema = z
  .object({
    search: optional(z.string().trim().max(SEARCH_MAX_CHARS)),
    destination: optional(z.string().trim().max(SEARCH_MAX_CHARS)),
    country: optional(z.string().trim().max(SEARCH_MAX_CHARS)),
    style: optional(z.enum(TRAVEL_STYLES)),
    currency: optional(z.enum(CURRENCIES)),
    minBudget: optional(wholeNumber),
    maxBudget: optional(wholeNumber),
    minDays: optional(wholeNumber),
    maxDays: optional(wholeNumber),
  })
  .strict()
  .superRefine((filter, context) => {
    const hasBudgetLimit = filter.minBudget !== undefined || filter.maxBudget !== undefined;
    if (hasBudgetLimit && filter.currency === undefined) {
      context.addIssue({ code: 'custom', path: ['currency'], message: 'A budget range needs a currency.' });
    }
    if (filter.minBudget !== undefined && filter.maxBudget !== undefined && filter.minBudget > filter.maxBudget) {
      context.addIssue({ code: 'custom', path: ['maxBudget'], message: 'The minimum budget is above the maximum.' });
    }
    if (filter.minDays !== undefined && filter.maxDays !== undefined && filter.minDays > filter.maxDays) {
      context.addIssue({ code: 'custom', path: ['maxDays'], message: 'The minimum number of Days is above the maximum.' });
    }
  });

const isSet = (value: string | undefined): value is string => value !== undefined && value !== '';
const sameText = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const isAtLeast = (value: number, minimum: number | undefined): boolean => minimum === undefined || value >= minimum;
const isAtMost = (value: number, maximum: number | undefined): boolean => maximum === undefined || value <= maximum;

function matchesSearch(trip: TripView, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  return [trip.name, trip.destination.name, trip.destination.country].some((text) => text.toLowerCase().includes(wanted));
}

export function matchesTripFilter(trip: TripView, filter: TripFilter): boolean {
  return (
    (!isSet(filter.search) || matchesSearch(trip, filter.search)) &&
    (!isSet(filter.destination) || trip.destination.id === filter.destination) &&
    (!isSet(filter.country) || sameText(trip.destination.country, filter.country)) &&
    (filter.style === undefined || trip.travelStyles.includes(filter.style)) &&
    (filter.currency === undefined || trip.currency === filter.currency) &&
    isAtLeast(trip.budget, filter.minBudget) &&
    isAtMost(trip.budget, filter.maxBudget) &&
    isAtLeast(trip.dayCount, filter.minDays) &&
    isAtMost(trip.dayCount, filter.maxDays)
  );
}

/** The Trips that meet every condition of the filter, in the order they were given. */
export const filterTrips = (trips: readonly TripView[], filter: TripFilter): TripView[] =>
  trips.filter((trip) => matchesTripFilter(trip, filter));
