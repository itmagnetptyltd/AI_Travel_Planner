import { useEffect, useState } from 'react';
import type { TripView } from '../../shared/trip-schemas';
import { api } from '../api-client';

export type TripsState =
  | { readonly state: 'loading' }
  /** `path` is the request the Trips were the answer to, so the page can tell an answer from one for an earlier search. */
  | { readonly state: 'loaded'; readonly trips: readonly TripView[]; readonly path: string }
  | { readonly state: 'failed'; readonly message: string };

/**
 * The Trips a request answers with. The last answer stays on show while the next is awaited, so the page does not
 * blink on every change. Nothing is asked for while `path` is null.
 */
export function useTrips(path: string | null, reloads: number): TripsState {
  const [trips, setTrips] = useState<TripsState>({ state: 'loading' });
  useEffect(() => {
    if (path === null) return undefined;
    let isCurrent = true;
    void api<{ trips: TripView[] }>('GET', path).then((result) => {
      if (!isCurrent) return;
      setTrips(
        result.ok
          ? { state: 'loaded', trips: result.data.trips, path }
          : { state: 'failed', message: result.error.message ?? 'Your Trips could not be loaded.' },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [path, reloads]);
  return trips;
}
