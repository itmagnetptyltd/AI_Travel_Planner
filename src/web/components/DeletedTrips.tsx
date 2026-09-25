import { useEffect, useState } from 'react';
import type { DeletedTrip } from '../../shared/trip-schemas';
import { api } from '../api-client';
import { deletedTripLine, RESTORE_WINDOW_NOTE, restoreProblem } from '../pages/deleted-trips-state';

/**
 * The Traveler's recently deleted Trips, each with a Restore button (REQ-TRV-099). Nothing shows when there are
 * none. `onRestored` runs after a Trip comes back, so the list of Trips can show it. A Trip that can no longer be
 * restored is taken off the list rather than left with a button that cannot work.
 */
export function DeletedTrips({ onRestored }: { readonly onRestored: () => void }) {
  const [trips, setTrips] = useState<readonly DeletedTrip[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    void api<{ trips: readonly DeletedTrip[] }>('GET', '/api/trips/deleted').then((result) => {
      if (!isCurrent) return;
      if (result.ok) setTrips(result.data.trips);
      else setProblem('Your recently deleted Trips could not be loaded.');
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  const restore = async (trip: DeletedTrip) => {
    setProblem(null);
    setIsRestoring(true);
    const result = await api('POST', `/api/trips/${encodeURIComponent(trip.id)}/restore`);
    setIsRestoring(false);
    if (!result.ok) {
      setProblem(restoreProblem(result.error));
      if (result.error.code === 'TRIP_NOT_FOUND') setTrips((previous) => previous.filter((candidate) => candidate.id !== trip.id));
      return;
    }
    setTrips((previous) => previous.filter((candidate) => candidate.id !== trip.id));
    onRestored();
  };

  if (trips.length === 0 && !problem) return null;
  return (
    <section aria-labelledby="deleted-trips-heading">
      <h2 id="deleted-trips-heading">Recently deleted</h2>
      <p className="muted">{RESTORE_WINDOW_NOTE}</p>
      {trips.length > 0 ? (
        <ul aria-label="Recently deleted Trips">
          {trips.map((trip) => (
            <li key={trip.id}>
              {deletedTripLine(trip)}{' '}
              <button type="button" disabled={isRestoring} aria-label={`Restore ${trip.name}`} onClick={() => void restore(trip)}>
                Restore
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? <p role="alert">{problem}</p> : null}
    </section>
  );
}
