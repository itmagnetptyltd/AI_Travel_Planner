import { TRIP_RESTORE_DAYS, type DeletedTrip } from '../../shared/trip-schemas';
import type { ApiError } from '../api-client';

const dateOf = (instant: string): string => instant.slice(0, 10);

/** One recently deleted Trip as the Traveler reads it: what it was, and how long it can still be restored. */
export const deletedTripLine = (trip: DeletedTrip): string =>
  `${trip.name}, ${trip.destination.name}, ${trip.destination.country}. Deleted ${dateOf(trip.deletedAt)}. Removed for good after ${dateOf(trip.purgesAt)}.`;

export const RESTORE_WINDOW_NOTE = `A deleted Trip can be restored for ${TRIP_RESTORE_DAYS} days. After that it is removed for good, with its Plans and chat.`;

/** A Trip that is not found has been removed for good in the meantime, or was never theirs. */
export function restoreProblem(error: ApiError): string {
  if (error.code === 'TRIP_NOT_FOUND') return 'That Trip can no longer be restored.';
  return error.message ?? 'The Trip could not be restored. Try again.';
}
