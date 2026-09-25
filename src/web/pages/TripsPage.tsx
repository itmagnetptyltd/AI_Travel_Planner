import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TripView } from '../../shared/trip-schemas';
import { api } from '../api-client';
import { DeletedTrips } from '../components/DeletedTrips';
import { travelersLabel } from './trip-labels';

type TripsState =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly trips: readonly TripView[] }
  | { readonly state: 'failed'; readonly message: string };

/** The Traveler's own saved Trips (REQ-TRV-016). */
export function TripsPage() {
  const [trips, setTrips] = useState<TripsState>({ state: 'loading' });
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    void api<{ trips: TripView[] }>('GET', '/api/trips').then((result) => {
      if (!isCurrent) return;
      setTrips(
        result.ok
          ? { state: 'loaded', trips: result.data.trips }
          : { state: 'failed', message: result.error.message ?? 'Your Trips could not be loaded.' },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [reloads]);

  return (
    <>
      <h1>Your Trips</h1>
      <p>
        <Link to="/trips/new">New Trip</Link>
      </p>
      {trips.state === 'loading' ? <p>Loading…</p> : null}
      {trips.state === 'loaded' && trips.trips.length === 0 ? <p>You have no Trips yet.</p> : null}
      {trips.state === 'loaded' && trips.trips.length > 0 ? <TripTable trips={trips.trips} /> : null}
      {trips.state === 'failed' ? <p role="alert">{trips.message}</p> : null}
      <DeletedTrips onRestored={() => setReloads((count) => count + 1)} />
    </>
  );
}

function TripTable({ trips }: { readonly trips: readonly TripView[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Destination</th>
          <th scope="col">Dates</th>
          <th scope="col">Travelers</th>
          <th scope="col">Budget</th>
          <th scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {trips.map((trip) => (
          <tr key={trip.id}>
            <td>
              <Link to={`/trips/${encodeURIComponent(trip.id)}`}>{trip.name}</Link>
            </td>
            <td>{`${trip.destination.name}, ${trip.destination.country}`}</td>
            <td>{`${trip.startDate} to ${trip.endDate}`}</td>
            <td>{travelersLabel(trip)}</td>
            <td>{`${trip.budget} ${trip.currency}`}</td>
            <td>{trip.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
