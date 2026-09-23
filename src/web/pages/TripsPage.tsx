import { useEffect, useState } from 'react';
import { api } from '../api-client';

type TripsState = { readonly state: 'loading' } | { readonly state: 'loaded' } | { readonly state: 'failed'; readonly message: string };

/** The Trip list itself arrives with REQ-TRV-016 (slice 3); until then it is always empty. */
export function TripsPage() {
  const [trips, setTrips] = useState<TripsState>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    void api<{ trips: unknown[] }>('GET', '/api/trips').then((result) => {
      if (!isCurrent) return;
      setTrips(result.ok ? { state: 'loaded' } : { state: 'failed', message: result.error.message ?? 'Your Trips could not be loaded.' });
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <>
      <h1>Your Trips</h1>
      {trips.state === 'loading' ? <p>Loading…</p> : null}
      {trips.state === 'loaded' ? <p>You have no Trips yet.</p> : null}
      {trips.state === 'failed' ? <p role="alert">{trips.message}</p> : null}
    </>
  );
}
