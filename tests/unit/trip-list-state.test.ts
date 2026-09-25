import { describe, expect, test } from 'vitest';
import {
  apiPathFor,
  EMPTY_FILTER_FORM,
  filterFormFrom,
  filterOptionsFrom,
  filterProblem,
  hasFilters,
  listMessage,
  paramsFrom,
} from '../../src/web/pages/trip-list-state';
import { aTripView } from '../support/a-trip-view';

describe('the search and filters in the address of the Trips page', () => {
  // @covers REQ-TRV-076@v1
  test('reads a search from the address, and writes it back', () => {
    const form = filterFormFrom(new URLSearchParams('search=Tokyo'));

    expect(form.search).toBe('Tokyo');
    expect(paramsFrom(form).toString()).toBe('search=Tokyo');
  });

  // @covers REQ-TRV-077@v1
  test('reads every filter from the address, and writes them all back', () => {
    const address = 'search=Tokyo&country=Japan&destination=d1&style=Family&currency=USD&minBudget=1000&maxBudget=3000&minDays=6&maxDays=10';

    const form = filterFormFrom(new URLSearchParams(address));

    expect(form).toEqual({
      search: 'Tokyo',
      country: 'Japan',
      destination: 'd1',
      style: 'Family',
      currency: 'USD',
      minBudget: '1000',
      maxBudget: '3000',
      minDays: '6',
      maxDays: '10',
    });
    expect(paramsFrom(form).toString()).toBe(address);
  });

  // @covers REQ-TRV-077@v1
  test('leaves a blank filter out of the address, and an empty address gives no filter', () => {
    expect(paramsFrom({ ...EMPTY_FILTER_FORM, style: 'Family', search: '   ' }).toString()).toBe('style=Family');
    expect(filterFormFrom(new URLSearchParams(''))).toEqual(EMPTY_FILTER_FORM);
    expect(paramsFrom(EMPTY_FILTER_FORM).toString()).toBe('');
  });

  // @covers REQ-TRV-077@v1
  test('ignores an address parameter it does not know, so a stale bookmark still opens', () => {
    expect(filterFormFrom(new URLSearchParams('colour=red&style=Family')).style).toBe('Family');
  });

  // @covers REQ-TRV-077@v1
  test('asks the server for the list with the filters, and for the plain list with none', () => {
    expect(apiPathFor(EMPTY_FILTER_FORM)).toBe('/api/trips');
    expect(apiPathFor({ ...EMPTY_FILTER_FORM, style: 'Family', minDays: '6' })).toBe('/api/trips?style=Family&minDays=6');
  });

  // @covers REQ-TRV-077@v1
  test('knows whether any filter is on, so Clear filters is offered only then', () => {
    expect(hasFilters(EMPTY_FILTER_FORM)).toBe(false);
    expect(hasFilters({ ...EMPTY_FILTER_FORM, search: ' ' })).toBe(false);
    expect(hasFilters({ ...EMPTY_FILTER_FORM, country: 'Japan' })).toBe(true);
  });
});

describe('the choices offered for a Traveler', () => {
  // @covers REQ-TRV-077@v1
  test('are the countries and Destinations of their own Trips, each once, in order', () => {
    const trips = [
      aTripView({ destinationName: 'Tokyo', country: 'Japan' }),
      aTripView({ destinationName: 'Paris', country: 'France' }),
      aTripView({ destinationName: 'Kyoto', country: 'Japan' }),
      aTripView({ destinationName: 'Tokyo', country: 'Japan' }),
    ];

    const options = filterOptionsFrom(trips);

    expect(options.countries).toEqual(['France', 'Japan']);
    expect(options.destinations.map((d) => d.label)).toEqual(['Kyoto, Japan', 'Paris, France', 'Tokyo, Japan']);
    expect(options.destinations.map((d) => d.id)).toEqual(['destination-Kyoto', 'destination-Paris', 'destination-Tokyo']);
  });

  // @covers REQ-TRV-077@v1
  test('are empty for a Traveler with no Trips', () => {
    expect(filterOptionsFrom([])).toEqual({ countries: [], destinations: [] });
  });
});

describe('what the page says when the list is empty', () => {
  // @covers REQ-TRV-076@v1
  test('says there are no Trips yet when the Traveler has none', () => {
    expect(listMessage({ total: 0, shown: 0, hasFilters: false })).toBe('You have no Trips yet.');
  });

  // @covers REQ-TRV-076@v1
  test('says no Trips match when there are Trips but the search or filters leave none', () => {
    expect(listMessage({ total: 3, shown: 0, hasFilters: true })).toBe('No Trips match your search.');
  });

  // @covers REQ-TRV-076@v1
  test('says nothing when there is something to show', () => {
    expect(listMessage({ total: 3, shown: 2, hasFilters: true })).toBeNull();
    expect(listMessage({ total: 3, shown: 3, hasFilters: false })).toBeNull();
  });
});

describe('a combination of filters that cannot be sent', () => {
  // @covers REQ-TRV-077@v1
  test('says to choose a currency when a budget limit is given without one', () => {
    expect(filterProblem({ ...EMPTY_FILTER_FORM, minBudget: '100' })).toBe('Choose a currency for the budget.');
    expect(filterProblem({ ...EMPTY_FILTER_FORM, maxBudget: '100' })).toBe('Choose a currency for the budget.');
  });

  // @covers REQ-TRV-077@v1
  test('says so when a minimum is above its maximum, for the budget and for the Days', () => {
    expect(filterProblem({ ...EMPTY_FILTER_FORM, currency: 'USD', minBudget: '500', maxBudget: '100' })).toBe('The minimum budget is above the maximum.');
    expect(filterProblem({ ...EMPTY_FILTER_FORM, minDays: '9', maxDays: '3' })).toBe('The minimum number of Days is above the maximum.');
  });

  // @covers REQ-TRV-077@v1
  test('says to use whole numbers when a limit is not one', () => {
    expect(filterProblem({ ...EMPTY_FILTER_FORM, minDays: '2.5' })).toBe('Use whole numbers for the Days and the budget.');
    expect(filterProblem({ ...EMPTY_FILTER_FORM, currency: 'USD', minBudget: 'lots' })).toBe('Use whole numbers for the Days and the budget.');
  });

  // @covers REQ-TRV-077@v1
  test('says so, as the server would, for a number of more than nine digits', () => {
    expect(filterProblem({ ...EMPTY_FILTER_FORM, currency: 'USD', maxBudget: '1234567890' })).toBe('Use whole numbers for the Days and the budget.');
    expect(filterProblem({ ...EMPTY_FILTER_FORM, currency: 'USD', maxBudget: '999999999' })).toBeNull();
  });

  // @covers REQ-TRV-077@v1
  test.each([
    ['a travel style that does not exist', { style: 'Sightseeing' }],
    ['a currency that does not exist', { currency: 'XYZ' }],
    ['a search over 100 characters', { search: 'x'.repeat(101) }],
  ])('says a filter is not valid, instead of sending it, for %s (a stale or hand-made address)', (_name, change) => {
    expect(filterProblem({ ...EMPTY_FILTER_FORM, ...change })).toBe('A filter in the address is not valid. Clear the filters to start again.');
  });

  // @covers REQ-TRV-077@v1
  test('has no problem with a sensible combination, or with none', () => {
    expect(filterProblem(EMPTY_FILTER_FORM)).toBeNull();
    expect(filterProblem({ ...EMPTY_FILTER_FORM, currency: 'USD', minBudget: '100', maxBudget: '500', minDays: '3', maxDays: '9' })).toBeNull();
  });
});
