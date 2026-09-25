import { Link } from 'react-router-dom';
import type { TripView } from '../../shared/trip-schemas';
import { travelersLabel } from '../pages/trip-labels';

export function TripTable({ trips }: { readonly trips: readonly TripView[] }) {
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
