import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminTripSummary } from '../../../shared/admin-trips';
import { api } from '../../api-client';
import { tripFeedbackLabel } from './admin-view-state';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly trips: readonly AdminTripSummary[] }
  | { readonly state: 'failed'; readonly message: string };

/** Every Traveler's Trips, each as a summary with its owner, and never a Day or an Activity (REQ-TRV-070). */
export function AdminTripsPage() {
  const [shown, setShown] = useState<State>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    void api<{ trips: AdminTripSummary[] }>('GET', '/api/admin/trips').then((result) => {
      if (!isCurrent) return;
      setShown(result.ok ? { state: 'loaded', trips: result.data.trips } : { state: 'failed', message: result.error.message ?? 'The Trips could not be loaded.' });
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <>
      <h1>Travelers’ Trips</h1>
      {shown.state === 'loading' ? <p>Loading…</p> : null}
      {shown.state === 'failed' ? <p role="alert">{shown.message}</p> : null}
      {shown.state === 'loaded' && shown.trips.length === 0 ? <p role="status">There are no Trips.</p> : null}
      {shown.state === 'loaded' && shown.trips.length > 0 ? (
        <table>
          <caption>Every Traveler’s Trips, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Trip</th>
              <th scope="col">Owner</th>
              <th scope="col">Destination</th>
              <th scope="col">Dates</th>
              <th scope="col">Travelers</th>
              <th scope="col">Budget</th>
              <th scope="col">Status</th>
              <th scope="col">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {shown.trips.map((trip) => (
              <tr key={trip.id}>
                <td>
                  <Link to={`/admin/trips/${encodeURIComponent(trip.id)}`}>{trip.name}</Link>
                </td>
                <td>{trip.owner.email}</td>
                <td>{`${trip.destination.name}, ${trip.destination.country}`}</td>
                <td>{`${trip.startDate} to ${trip.endDate}`}</td>
                <td>{trip.numberOfTravelers}</td>
                <td>{`${trip.budget} ${trip.currency}`}</td>
                <td>{trip.status}</td>
                <td>{tripFeedbackLabel(trip.feedback)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
