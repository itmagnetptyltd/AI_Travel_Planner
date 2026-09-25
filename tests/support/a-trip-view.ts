import type { TripView } from '../../src/shared/trip-schemas';

let counter = 0;

/** A Trip as the list shows it: a 4-Day Trip to Kyoto, Japan, budget 5000 USD, with no travel style. */
export function aTripView(overrides: Partial<TripView> & { readonly destinationName?: string; readonly country?: string } = {}): TripView {
  counter += 1;
  const { destinationName = 'Kyoto', country = 'Japan', ...rest } = overrides;
  return {
    id: `trip-${counter}`,
    name: `Trip ${counter}`,
    destination: { id: `destination-${destinationName}`, name: destinationName, country },
    startDate: '2026-10-10',
    endDate: '2026-10-13',
    dayCount: 4,
    adults: 2,
    children: 0,
    numberOfTravelers: 2,
    budget: 5000,
    currency: 'USD',
    travelStyles: [],
    interests: [],
    foodPreferences: [],
    transportation: [],
    accommodation: null,
    status: 'Draft',
    ...rest,
  };
}
