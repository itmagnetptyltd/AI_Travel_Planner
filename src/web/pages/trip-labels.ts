import type { TripView } from '../../shared/trip-schemas';

export const travelersLabel = (trip: Pick<TripView, 'numberOfTravelers'>): string =>
  trip.numberOfTravelers === 1 ? '1 traveler' : `${trip.numberOfTravelers} travelers`;
