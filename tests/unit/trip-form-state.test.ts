import { describe, expect, test } from 'vitest';
import type { TripView } from '../../src/shared/trip-schemas';
import {
  initialTripFormState,
  newTripValues,
  tripFormReducer,
  tripPayload,
  valuesFromTrip,
  type TripFormState,
} from '../../src/web/pages/trip-form-state';

function anEditedForm(): TripFormState {
  const loaded = tripFormReducer(initialTripFormState(), {
    type: 'loaded',
    values: { ...initialTripFormState().values, name: 'Tokyo Family Holiday', budget: '5000' },
  });
  return tripFormReducer(loaded, { type: 'changed', field: 'name', value: 'Tokyo Autumn' });
}

describe('saving a Trip edit', () => {
  // @covers REQ-TRV-061@v1
  test('a saved outcome carries a success message', () => {
    const state = tripFormReducer(anEditedForm(), { type: 'saved' });

    expect(state.outcome).toEqual({ kind: 'saved', message: 'Trip saved.' });
  });

  // @covers REQ-TRV-061@v1
  test('a failed outcome carries a failure message and keeps the entered values', () => {
    const edited = anEditedForm();

    const state = tripFormReducer(edited, { type: 'failed', error: { code: 'INTERNAL_ERROR' } });

    expect(state.outcome).toEqual({ kind: 'failed', message: 'Your Trip could not be saved. Try again.' });
    expect(state.values).toEqual(edited.values);
    expect(state.values.name).toBe('Tokyo Autumn');
  });

  // @covers REQ-TRV-061@v1
  test('a refused field is named in the failure and keeps the entered values', () => {
    const edited = anEditedForm();

    const state = tripFormReducer(edited, { type: 'failed', error: { code: 'VALIDATION_FAILED', field: 'endDate' } });

    expect(state.outcome).toEqual({ kind: 'failed', message: 'Check the end date.', field: 'endDate' });
    expect(state.values).toEqual(edited.values);
  });
});

const chosenTravelStyles = (state: TripFormState) => state.values.travelStyles;

describe('choosing several options from a list', () => {
  // @covers REQ-TRV-020@v1
  test('adds an option when it is ticked, and removes it when it is ticked again', () => {
    const family = tripFormReducer(initialTripFormState(), { type: 'toggled', field: 'travelStyles', option: 'Family' });
    const familyAndCultural = tripFormReducer(family, { type: 'toggled', field: 'travelStyles', option: 'Cultural' });
    const culturalOnly = tripFormReducer(familyAndCultural, { type: 'toggled', field: 'travelStyles', option: 'Family' });

    expect(chosenTravelStyles(family)).toEqual(['Family']);
    expect(chosenTravelStyles(familyAndCultural)).toEqual(['Family', 'Cultural']);
    expect(chosenTravelStyles(culturalOnly)).toEqual(['Cultural']);
  });

  // @covers REQ-TRV-021@v1
  test('keeps each list separate, so ticking History under interests does not touch the travel styles', () => {
    const state = tripFormReducer(
      tripFormReducer(initialTripFormState(), { type: 'toggled', field: 'travelStyles', option: 'Adventure' }),
      { type: 'toggled', field: 'interests', option: 'Adventure' },
    );

    expect(state.values.travelStyles).toEqual(['Adventure']);
    expect(state.values.interests).toEqual(['Adventure']);
  });

  // @covers REQ-TRV-022@v1
  test('clears a failure once an option is changed, and keeps the other values', () => {
    const failed = tripFormReducer(initialTripFormState(), { type: 'failed', error: { code: 'VALIDATION_FAILED', field: 'foodPreferences' } });

    const state = tripFormReducer(failed, { type: 'toggled', field: 'foodPreferences', option: 'Vegan' });

    expect(state.outcome).toEqual({ kind: 'idle' });
    expect(state.values.foodPreferences).toEqual(['Vegan']);
  });
});

describe('a refusal of one of the preference lists', () => {
  // @covers REQ-TRV-020@v1
  test.each([
    ['travelStyles', 'Check the travel style.'],
    ['interests', 'Check the interests.'],
    ['foodPreferences', 'Check the food preference.'],
    ['transportation', 'Check the transportation.'],
    ['accommodation', 'Check the accommodation preferences.'],
  ])('names %s to the Traveler', (field, message) => {
    const state = tripFormReducer(initialTripFormState(), { type: 'failed', error: { code: 'VALIDATION_FAILED', field } });

    expect(state.outcome).toEqual({ kind: 'failed', message, field });
  });
});

describe('a new Trip form', () => {
  // @covers REQ-TRV-010@v1
  test('is pre-filled with the profile currency USD, travel style Family and food preference Vegetarian', () => {
    const values = newTripValues({ preferredCurrency: 'USD', defaultTravelStyle: 'Family', foodPreference: 'Vegetarian' });

    expect(values).toMatchObject({ currency: 'USD', travelStyles: ['Family'], foodPreferences: ['Vegetarian'] });
  });

  // @covers REQ-TRV-010@v1
  test('does not tick No Preference for a profile that says No Preference, since that is what a Trip planned with nothing ticked gets', () => {
    const values = newTripValues({ preferredCurrency: 'USD', defaultTravelStyle: null, foodPreference: 'No Preference' });

    expect(values.foodPreferences).toEqual([]);
  });

  // @covers REQ-TRV-010@v1
  test('is not pre-filled with anything the profile does not have', () => {
    const values = newTripValues({ preferredCurrency: null, defaultTravelStyle: null, foodPreference: null });

    expect(values).toMatchObject({ currency: '', travelStyles: [], foodPreferences: [], interests: [], transportation: [] });
  });
});

describe('the values of a saved Trip', () => {
  const TRIP: TripView = {
    id: 'a-trip',
    name: 'Tokyo Family Holiday',
    destination: { id: 'd1', name: 'Tokyo', country: 'Japan' },
    startDate: '2026-10-10',
    endDate: '2026-10-17',
    dayCount: 8,
    adults: 2,
    children: 2,
    numberOfTravelers: 4,
    budget: 5000,
    currency: 'USD',
    travelStyles: ['Family', 'Cultural'],
    interests: ['History', 'Food'],
    foodPreferences: ['Vegetarian', 'Gluten-Free'],
    transportation: ['Public Transport', 'Walking'],
    accommodation: { type: 'Hotel', preferredLocation: 'near the city centre' },
    status: 'Draft',
  };

  // @covers REQ-TRV-020@v1
  test('fill the edit form with every list and every accommodation value', () => {
    expect(valuesFromTrip(TRIP)).toMatchObject({
      travelStyles: ['Family', 'Cultural'],
      interests: ['History', 'Food'],
      foodPreferences: ['Vegetarian', 'Gluten-Free'],
      transportation: ['Public Transport', 'Walking'],
      accommodationType: 'Hotel',
      accommodationPreferredLocation: 'near the city centre',
      accommodationBudgetRange: '',
    });
  });

  // @covers REQ-TRV-025@v1
  test('are sent back as lists and as an accommodation object with only the values that were filled in', () => {
    expect(tripPayload(valuesFromTrip(TRIP))).toMatchObject({
      travelStyles: ['Family', 'Cultural'],
      interests: ['History', 'Food'],
      foodPreferences: ['Vegetarian', 'Gluten-Free'],
      transportation: ['Public Transport', 'Walking'],
      accommodation: { type: 'Hotel', preferredLocation: 'near the city centre' },
    });
  });

  // @covers REQ-TRV-025@v1
  test('send null for the accommodation when every value has been cleared, so an edit clears it', () => {
    const cleared = { ...valuesFromTrip(TRIP), accommodationType: '  ', accommodationPreferredLocation: '' };

    expect(tripPayload(cleared)).toMatchObject({ accommodation: null });
  });
});
