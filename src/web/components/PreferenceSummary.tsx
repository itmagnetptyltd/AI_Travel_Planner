import { ACCOMMODATION_FIELDS, ACCOMMODATION_LABELS } from '../../shared/trip-preferences';
import type { TripView } from '../../shared/trip-schemas';

/** What the Traveler chose for the Trip. A list they left empty is not shown, so nothing looks chosen that was not. */
export function PreferenceSummary({ trip }: { readonly trip: TripView }) {
  const lists: readonly (readonly [string, readonly string[]])[] = [
    ['Travel style', trip.travelStyles],
    ['Interests', trip.interests],
    ['Food preference', trip.foodPreferences],
    ['Transportation', trip.transportation],
  ];
  const accommodation = trip.accommodation ?? {};
  const lines = [
    ...lists.filter(([, values]) => values.length > 0).map(([label, values]) => `${label}: ${values.join(', ')}`),
    ...ACCOMMODATION_FIELDS.flatMap((field) => (accommodation[field] ? [`${ACCOMMODATION_LABELS[field]}: ${accommodation[field]}`] : [])),
  ];
  return (
    <>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </>
  );
}
