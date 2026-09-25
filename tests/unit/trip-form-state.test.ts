import { describe, expect, test } from 'vitest';
import { initialTripFormState, tripFormReducer, type TripFormState } from '../../src/web/pages/trip-form-state';

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
