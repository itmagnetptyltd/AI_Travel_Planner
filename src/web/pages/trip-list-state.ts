import { tripFilterSchema } from '../../shared/trip-filter';
import type { TripView } from '../../shared/trip-schemas';

/**
 * What the Traveler has typed or chosen in the search and filters, as text, exactly as it is in the address of the
 * Trips page (REQ-TRV-076, REQ-TRV-077). Blank means "not filtered on".
 */
export interface FilterForm {
  readonly search: string;
  readonly country: string;
  readonly destination: string;
  readonly style: string;
  readonly currency: string;
  readonly minBudget: string;
  readonly maxBudget: string;
  readonly minDays: string;
  readonly maxDays: string;
}

export const EMPTY_FILTER_FORM: FilterForm = {
  search: '',
  country: '',
  destination: '',
  style: '',
  currency: '',
  minBudget: '',
  maxBudget: '',
  minDays: '',
  maxDays: '',
};

/** In the order they are written to the address. */
const FIELDS = ['search', 'country', 'destination', 'style', 'currency', 'minBudget', 'maxBudget', 'minDays', 'maxDays'] as const satisfies readonly (keyof FilterForm)[];

/** An address parameter this page does not know is ignored, so a stale bookmark still opens. */
export const filterFormFrom = (params: URLSearchParams): FilterForm => {
  const value = (field: keyof FilterForm) => params.get(field) ?? '';
  return {
    search: value('search'),
    country: value('country'),
    destination: value('destination'),
    style: value('style'),
    currency: value('currency'),
    minBudget: value('minBudget'),
    maxBudget: value('maxBudget'),
    minDays: value('minDays'),
    maxDays: value('maxDays'),
  };
};

export function paramsFrom(form: FilterForm): URLSearchParams {
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    const value = form[field].trim();
    if (value !== '') params.set(field, value);
  }
  return params;
}

export function apiPathFor(form: FilterForm): string {
  const query = paramsFrom(form).toString();
  return query === '' ? '/api/trips' : `/api/trips?${query}`;
}

export const hasFilters = (form: FilterForm): boolean => paramsFrom(form).size > 0;

/** The same limit as the server: whole numbers of up to nine digits. */
const INVALID_FILTER = 'A filter in the address is not valid. Clear the filters to start again.';
const WHOLE_NUMBER = /^\d{1,9}$/;
const LIMITS = ['minBudget', 'maxBudget', 'minDays', 'maxDays'] as const;

/** Why the filters as they stand cannot be sent, or null. Said on the page, so the Traveler is not left with a list that ignores them. */
export function filterProblem(form: FilterForm): string | null {
  const given = LIMITS.filter((limit) => form[limit].trim() !== '');
  if (given.some((limit) => !WHOLE_NUMBER.test(form[limit].trim()))) return 'Use whole numbers for the Days and the budget.';
  if ((form.minBudget.trim() !== '' || form.maxBudget.trim() !== '') && form.currency === '') return 'Choose a currency for the budget.';
  if (isAbove(form.minBudget, form.maxBudget)) return 'The minimum budget is above the maximum.';
  if (isAbove(form.minDays, form.maxDays)) return 'The minimum number of Days is above the maximum.';
  // Anything else the server would refuse: a style or currency that does not exist, or a search that is too long.
  return tripFilterSchema.safeParse(Object.fromEntries(paramsFrom(form))).success ? null : INVALID_FILTER;
}

const isAbove = (minimum: string, maximum: string): boolean =>
  minimum.trim() !== '' && maximum.trim() !== '' && Number(minimum) > Number(maximum);

export interface FilterOptions {
  readonly countries: readonly string[];
  readonly destinations: readonly { readonly id: string; readonly label: string }[];
}

/** The countries and Destinations of the Traveler's own Trips, each once, in order: the only ones a filter could find anything for. */
export function filterOptionsFrom(trips: readonly TripView[]): FilterOptions {
  const countries = [...new Set(trips.map((trip) => trip.destination.country))].sort((a, b) => a.localeCompare(b));
  const byId = new Map(trips.map((trip) => [trip.destination.id, `${trip.destination.name}, ${trip.destination.country}`]));
  const destinations = [...byId].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  return { countries, destinations };
}

/** What the list says when it has nothing to show: the Traveler has no Trips, or the search and filters leave none. */
export function listMessage(counts: { readonly total: number; readonly shown: number; readonly hasFilters: boolean }): string | null {
  if (counts.total === 0) return 'You have no Trips yet.';
  return counts.shown === 0 && counts.hasFilters ? 'No Trips match your search.' : null;
}
