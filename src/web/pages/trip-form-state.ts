import type { TripView } from '../../shared/trip-schemas';
import type { ApiError } from '../api-client';

/** What the Traveler has typed, exactly as typed: every field is text until it is sent. */
export interface TripFormValues {
  readonly name: string;
  readonly destinationId: string;
  readonly destinationLabel: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly adults: string;
  readonly children: string;
  readonly budget: string;
  readonly currency: string;
  readonly travelStyle: string;
}

export type TripFormField = keyof TripFormValues;

export type TripFormOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saved'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string; readonly field?: string };

export interface TripFormState {
  readonly values: TripFormValues;
  readonly outcome: TripFormOutcome;
}

export type TripFormAction =
  | { readonly type: 'loaded'; readonly values: TripFormValues }
  | { readonly type: 'changed'; readonly field: TripFormField; readonly value: string }
  | { readonly type: 'saved' }
  | { readonly type: 'failed'; readonly error: ApiError };

const SAVED_MESSAGE = 'Trip saved.';
const FAILED_MESSAGE = 'Your Trip could not be saved. Try again.';

/** How each field the server can refuse is named to the Traveler. */
const FIELD_NAMES: Readonly<Record<string, string>> = {
  name: 'trip name',
  destinationId: 'Destination',
  startDate: 'start date',
  endDate: 'end date',
  adults: 'number of adults',
  children: 'number of children',
  budget: 'budget',
  currency: 'currency',
  travelStyles: 'travel style',
};

const EMPTY_VALUES: TripFormValues = {
  name: '',
  destinationId: '',
  destinationLabel: '',
  startDate: '',
  endDate: '',
  adults: '',
  children: '0',
  budget: '',
  currency: '',
  travelStyle: '',
};

export const initialTripFormState = (): TripFormState => ({ values: EMPTY_VALUES, outcome: { kind: 'idle' } });

/** A failure never touches the values, so the Traveler loses nothing they typed (REQ-TRV-061). */
export function tripFormReducer(state: TripFormState, action: TripFormAction): TripFormState {
  switch (action.type) {
    case 'loaded':
      return { values: action.values, outcome: { kind: 'idle' } };
    case 'changed':
      return { values: { ...state.values, [action.field]: action.value }, outcome: { kind: 'idle' } };
    case 'saved':
      return { ...state, outcome: { kind: 'saved', message: SAVED_MESSAGE } };
    case 'failed':
      return { ...state, outcome: failure(action.error) };
  }
}

function failure(error: ApiError): TripFormOutcome {
  const fieldName = error.field === undefined ? undefined : FIELD_NAMES[error.field];
  return fieldName === undefined || error.field === undefined
    ? { kind: 'failed', message: FAILED_MESSAGE }
    : { kind: 'failed', message: `Check the ${fieldName}.`, field: error.field };
}

/** Values pre-filled for a new Trip from the Traveler's profile (REQ-TRV-010, REQ-TRV-011). */
export function newTripValues(profile: { readonly preferredCurrency: string | null; readonly defaultTravelStyle: string | null }): TripFormValues {
  return { ...EMPTY_VALUES, currency: profile.preferredCurrency ?? '', travelStyle: profile.defaultTravelStyle ?? '' };
}

export function valuesFromTrip(trip: TripView): TripFormValues {
  return {
    name: trip.name,
    destinationId: trip.destination.id,
    destinationLabel: `${trip.destination.name}, ${trip.destination.country}`,
    startDate: trip.startDate,
    endDate: trip.endDate,
    adults: String(trip.adults),
    children: String(trip.children),
    budget: String(trip.budget),
    currency: trip.currency,
    travelStyle: trip.travelStyles[0] ?? '',
  };
}

/** A blank field is left out, so the server names it rather than receiving a guess. */
export function tripPayload(values: TripFormValues): Record<string, unknown> {
  const numberOrOmit = (text: string) => (text.trim() === '' ? undefined : Number(text));
  return {
    name: values.name,
    destinationId: values.destinationId === '' ? undefined : values.destinationId,
    startDate: values.startDate === '' ? undefined : values.startDate,
    endDate: values.endDate === '' ? undefined : values.endDate,
    adults: numberOrOmit(values.adults),
    children: numberOrOmit(values.children),
    budget: numberOrOmit(values.budget),
    currency: values.currency === '' ? undefined : values.currency,
    travelStyles: values.travelStyle === '' ? [] : [values.travelStyle],
  };
}
