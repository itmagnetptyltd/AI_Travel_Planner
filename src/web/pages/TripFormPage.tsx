import { useEffect, useReducer, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TripView } from '../../shared/trip-schemas';
import { api } from '../api-client';
import { TripForm } from '../components/TripForm';
import {
  initialTripFormState,
  newTripValues,
  tripFormReducer,
  tripPayload,
  valuesFromTrip,
} from './trip-form-state';

type ProfileDefaults = {
  readonly preferredCurrency: string | null;
  readonly defaultTravelStyle: string | null;
  readonly foodPreference: string | null;
};

/** Creates a Trip at /trips/new, or edits one at /trips/:id/edit. */
export function TripFormPage() {
  const { id } = useParams();
  const isEditing = id !== undefined;
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(tripFormReducer, undefined, initialTripFormState);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const load = async () => {
      if (isEditing) {
        const trip = await api<TripView>('GET', `/api/trips/${encodeURIComponent(id)}`);
        if (!isCurrent) return;
        if (trip.ok) dispatch({ type: 'loaded', values: valuesFromTrip(trip.data) });
        else setLoadFailure('Trip not found');
        return;
      }
      const profile = await api<ProfileDefaults>('GET', '/api/profile');
      if (isCurrent && profile.ok) dispatch({ type: 'loaded', values: newTripValues(profile.data) });
    };
    void load();
    return () => {
      isCurrent = false;
    };
  }, [id, isEditing]);

  const save = async () => {
    const result = isEditing
      ? await api<TripView>('PATCH', `/api/trips/${encodeURIComponent(id)}`, tripPayload(state.values))
      : await api<TripView>('POST', '/api/trips', tripPayload(state.values));
    if (!result.ok) {
      dispatch({ type: 'failed', error: result.error });
      return;
    }
    if (isEditing) dispatch({ type: 'saved' });
    else navigate('/trips');
  };

  if (loadFailure) {
    return <h1>{loadFailure}</h1>;
  }
  return (
    <>
      <h1>{isEditing ? 'Edit Trip' : 'New Trip'}</h1>
      <TripForm state={state} dispatch={dispatch} submitLabel={isEditing ? 'Save changes' : 'Create Trip'} onSubmit={() => void save()} />
      <p>
        <Link to={isEditing ? `/trips/${encodeURIComponent(id)}` : '/trips'}>Back</Link>
      </p>
    </>
  );
}
