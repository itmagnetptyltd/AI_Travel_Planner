import { ACCOMMODATION_FIELDS, NO_PREFERENCE, type AccommodationField } from '../../shared/trip-preferences';
import type { TripView } from '../../shared/trip-schemas';
import type { ApiError } from '../api-client';

export const TRIP_FORM_LIST_FIELDS = ['travelStyles', 'interests', 'foodPreferences', 'transportation'] as const;
export type TripFormListField = (typeof TRIP_FORM_LIST_FIELDS)[number];

/** What the Traveler has typed or ticked, exactly as entered: text fields are text until sent, lists are the ticked options. */
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
  readonly travelStyles: readonly string[];
  readonly interests: readonly string[];
  readonly foodPreferences: readonly string[];
  readonly transportation: readonly string[];
  readonly accommodationType: string;
  readonly accommodationBudgetRange: string;
  readonly accommodationPreferredLocation: string;
  readonly accommodationRating: string;
  readonly accommodationFacilities: string;
}

export type TripFormTextField = Exclude<keyof TripFormValues, TripFormListField>;

/** Which form field holds each of the five accommodation values. */
export const ACCOMMODATION_FORM_FIELDS: Readonly<Record<AccommodationField, TripFormTextField>> = {
  type: 'accommodationType',
  budgetRange: 'accommodationBudgetRange',
  preferredLocation: 'accommodationPreferredLocation',
  rating: 'accommodationRating',
  facilities: 'accommodationFacilities',
};

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
  | { readonly type: 'changed'; readonly field: TripFormTextField; readonly value: string }
  | { readonly type: 'toggled'; readonly field: TripFormListField; readonly option: string }
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
  interests: 'interests',
  foodPreferences: 'food preference',
  transportation: 'transportation',
  accommodation: 'accommodation preferences',
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
  travelStyles: [],
  interests: [],
  foodPreferences: [],
  transportation: [],
  accommodationType: '',
  accommodationBudgetRange: '',
  accommodationPreferredLocation: '',
  accommodationRating: '',
  accommodationFacilities: '',
};

export const initialTripFormState = (): TripFormState => ({ values: EMPTY_VALUES, outcome: { kind: 'idle' } });

const withToggled = (options: readonly string[], option: string): readonly string[] =>
  options.includes(option) ? options.filter((chosen) => chosen !== option) : [...options, option];

/** A failure never touches the values, so the Traveler loses nothing they typed (REQ-TRV-061). */
export function tripFormReducer(state: TripFormState, action: TripFormAction): TripFormState {
  switch (action.type) {
    case 'loaded':
      return { values: action.values, outcome: { kind: 'idle' } };
    case 'changed':
      return { values: { ...state.values, [action.field]: action.value }, outcome: { kind: 'idle' } };
    case 'toggled':
      return {
        values: { ...state.values, [action.field]: withToggled(state.values[action.field], action.option) },
        outcome: { kind: 'idle' },
      };
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
export function newTripValues(profile: {
  readonly preferredCurrency: string | null;
  readonly defaultTravelStyle: string | null;
  readonly foodPreference: string | null;
}): TripFormValues {
  return {
    ...EMPTY_VALUES,
    currency: profile.preferredCurrency ?? '',
    travelStyles: profile.defaultTravelStyle === null ? [] : [profile.defaultTravelStyle],
    // No Preference stands alone and is what a Trip with nothing ticked is planned with, so ticking it here
    // would only make the Traveler untick it before choosing anything else.
    foodPreferences: profile.foodPreference === null || profile.foodPreference === NO_PREFERENCE ? [] : [profile.foodPreference],
  };
}

export function valuesFromTrip(trip: TripView): TripFormValues {
  const accommodation = trip.accommodation ?? {};
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
    travelStyles: trip.travelStyles,
    interests: trip.interests,
    foodPreferences: trip.foodPreferences,
    transportation: trip.transportation,
    accommodationType: accommodation.type ?? '',
    accommodationBudgetRange: accommodation.budgetRange ?? '',
    accommodationPreferredLocation: accommodation.preferredLocation ?? '',
    accommodationRating: accommodation.rating ?? '',
    accommodationFacilities: accommodation.facilities ?? '',
  };
}

/** The accommodation values that were filled in, or null when none were, so saving a blank form clears them. */
function accommodationPayload(values: TripFormValues): Record<string, string> | null {
  const given = ACCOMMODATION_FIELDS.flatMap((field) => {
    const value = values[ACCOMMODATION_FORM_FIELDS[field]].trim();
    return value === '' ? [] : [[field, value] as const];
  });
  return given.length === 0 ? null : Object.fromEntries(given);
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
    travelStyles: values.travelStyles,
    interests: values.interests,
    foodPreferences: values.foodPreferences,
    transportation: values.transportation,
    accommodation: accommodationPayload(values),
  };
}
