import { useCallback, useEffect, useState } from 'react';
import type { DestinationInput } from '../../../shared/destination-schemas';
import { api, type ApiError } from '../../api-client';
import { durationLabel, type Destination } from '../destination';
import { DestinationForm } from './DestinationForm';

/** The Administrator's Destination list: add, edit, disable or re-enable, remove (REQ-TRV-072..075). */
export function AdminDestinationsPage() {
  const [destinations, setDestinations] = useState<readonly Destination[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api<{ destinations: Destination[] }>('GET', '/api/admin/destinations');
    if (result.ok) setDestinations(result.data.destinations);
    else setError(result.error.message ?? 'Destinations could not be loaded.');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (method: 'POST' | 'PATCH', path: string, input: DestinationInput): Promise<ApiError | null> => {
    const result = await api(method, path, input);
    if (!result.ok) return result.error;
    setEditingId(null);
    await load();
    return null;
  };

  const act = async (method: 'POST' | 'DELETE', path: string) => {
    const result = await api(method, path);
    setError(result.ok ? null : (result.error.message ?? 'The Destination could not be changed.'));
    await load();
  };

  const editing = destinations.find((d) => d.id === editingId) ?? null;
  const pathFor = (destination: Destination) => `/api/admin/destinations/${encodeURIComponent(destination.id)}`;

  return (
    <>
      <h1>Destinations</h1>
      {error ? <p role="alert">{error}</p> : null}
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Country</th>
            <th scope="col">Recommended duration</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {destinations.map((destination) => (
            <tr key={destination.id}>
              <td>{destination.name}</td>
              <td>{destination.country}</td>
              <td>{durationLabel(destination.recommendedDurationDays)}</td>
              <td>{destination.isDisabled ? 'Disabled' : 'Enabled'}</td>
              <td>
                <button type="button" onClick={() => setEditingId(destination.id)}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void act('POST', `${pathFor(destination)}/${destination.isDisabled ? 'enable' : 'disable'}`)}
                >
                  {destination.isDisabled ? 'Enable' : 'Disable'}
                </button>
                <button type="button" onClick={() => void act('DELETE', pathFor(destination))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing ? (
        <>
          <h2>Edit {editing.name}</h2>
          <DestinationForm
            key={editing.id}
            name={`Edit ${editing.name}`}
            initial={editing}
            submitLabel="Save changes"
            onSubmit={(input) => save('PATCH', pathFor(editing), input)}
          />
        </>
      ) : null}
      <h2>Add a Destination</h2>
      <DestinationForm
        name="Add a Destination"
        initial={null}
        submitLabel="Add Destination"
        onSubmit={(input) => save('POST', '/api/admin/destinations', input)}
      />
    </>
  );
}
