import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TripView } from '../../shared/trip-schemas';
import { api } from '../api-client';
import { PlanGenerator } from '../components/PlanGenerator';
import { PreferenceSummary } from '../components/PreferenceSummary';
import { travelersLabel } from './trip-labels';

type TripState =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly trip: TripView }
  | { readonly state: 'not-found' };

/** One Trip, with Edit and Delete. Someone else's Trip reads exactly like a missing one (REQ-TRV-007). */
export function TripPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<TripState>({ state: 'loading' });
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null);
  const path = `/api/trips/${encodeURIComponent(id)}`;

  useEffect(() => {
    let isCurrent = true;
    void api<TripView>('GET', path).then((result) => {
      if (isCurrent) setTrip(result.ok ? { state: 'loaded', trip: result.data } : { state: 'not-found' });
    });
    return () => {
      isCurrent = false;
    };
  }, [path]);

  /** A saved Plan makes the Trip Planned, so the page reads the Trip again rather than keep saying Draft. */
  const reloadTrip = () => {
    void api<TripView>('GET', path).then((result) => {
      if (result.ok) setTrip({ state: 'loaded', trip: result.data });
    });
  };

  const deleteTrip = async () => {
    const result = await api('DELETE', path);
    if (result.ok) navigate('/trips');
    else setDeleteFailure(result.error.message ?? 'The Trip could not be deleted. Try again.');
  };

  if (trip.state === 'loading') return <p>Loading…</p>;
  if (trip.state === 'not-found') return <h1>Trip not found</h1>;
  const { trip: shown } = trip;
  return (
    <>
      <h1>{shown.name}</h1>
      <dl>
        <dt>Destination</dt>
        <dd>{`${shown.destination.name}, ${shown.destination.country}`}</dd>
        <dt>Dates</dt>
        <dd>{`${shown.startDate} to ${shown.endDate}`}</dd>
        <dt>Travelers</dt>
        <dd>{travelersLabel(shown)}</dd>
        <dt>Budget</dt>
        <dd>{`${shown.budget} ${shown.currency}`}</dd>
        <dt>Status</dt>
        <dd>{shown.status}</dd>
      </dl>
      <PreferenceSummary trip={shown} />
      <PlanGenerator key={shown.id} trip={shown} onPlanSaved={reloadTrip} />
      <Link to={`/trips/${encodeURIComponent(shown.id)}/edit`}>Edit</Link>
      {isConfirmingDelete ? (
        <div role="group" aria-label="Confirm delete">
          <p>Delete this Trip?</p>
          <button type="button" onClick={() => void deleteTrip()}>
            Yes, delete
          </button>
          <button type="button" onClick={() => setIsConfirmingDelete(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setIsConfirmingDelete(true)}>
          Delete Trip
        </button>
      )}
      {deleteFailure ? <p role="alert">{deleteFailure}</p> : null}
    </>
  );
}
