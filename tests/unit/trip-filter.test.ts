import { describe, expect, test } from 'vitest';
import { filterTrips, tripFilterSchema, type TripFilter } from '../../src/shared/trip-filter';
import { aTripView } from '../support/a-trip-view';

const tokyo = aTripView({ name: 'Tokyo Family Holiday', destinationName: 'Tokyo', travelStyles: ['Family'] });
const paris = aTripView({ name: 'Paris Weekend', destinationName: 'Paris', country: 'France', travelStyles: ['Business'], dayCount: 3 });

const namesOf = (trips: readonly { readonly name: string }[]) => trips.map((trip) => trip.name);
const kept = (filter: TripFilter, trips = [tokyo, paris]) => namesOf(filterTrips(trips, filter));

describe('searching Trips', () => {
  // @covers REQ-TRV-076@v1
  test('keeps "Tokyo Family Holiday" and drops "Paris Weekend" when searching for "Tokyo"', () => {
    expect(kept({ search: 'Tokyo' })).toEqual(['Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-076@v1
  test('ignores capitals, finds the text anywhere in the name, and ignores spaces at its ends', () => {
    expect(kept({ search: '  fAMILY hol ' })).toEqual(['Tokyo Family Holiday']);
    expect(kept({ search: 'weekend' })).toEqual(['Paris Weekend']);
  });

  // @covers REQ-TRV-076@v1
  test('also finds a Trip by the name and the country of its Destination', () => {
    const kyoto = aTripView({ name: 'Family Holiday', destinationName: 'Kyoto', country: 'Japan' });

    expect(kept({ search: 'kyoto' }, [kyoto, paris])).toEqual(['Family Holiday']);
    expect(kept({ search: 'france' }, [kyoto, paris])).toEqual(['Paris Weekend']);
  });

  // @covers REQ-TRV-076@v1
  test('keeps every Trip for an empty or blank search, and finds nothing for text no Trip has', () => {
    expect(kept({ search: '' })).toEqual(['Tokyo Family Holiday', 'Paris Weekend']);
    expect(kept({ search: '   ' })).toEqual(['Tokyo Family Holiday', 'Paris Weekend']);
    expect(kept({ search: 'Sydney' })).toEqual([]);
  });

  // @covers REQ-TRV-076@v1
  test('treats what looks like a pattern as plain text', () => {
    expect(kept({ search: '.*' })).toEqual([]);
    expect(kept({ search: '%' })).toEqual([]);
  });
});

describe('filtering Trips by travel style', () => {
  // @covers REQ-TRV-077@v1
  test('keeps the Family Trip and drops the Business Trip when the style is Family', () => {
    expect(kept({ style: 'Family' })).toEqual(['Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-077@v1
  test('keeps a Trip that has the style among several', () => {
    const both = aTripView({ name: 'Two styles', travelStyles: ['Family', 'Cultural'] });

    expect(kept({ style: 'Cultural' }, [both, tokyo])).toEqual(['Two styles']);
  });

  // @covers REQ-TRV-077@v1
  test('drops a Trip that has no travel style', () => {
    expect(kept({ style: 'Family' }, [aTripView({ name: 'Plain' })])).toEqual([]);
  });
});

describe('filtering Trips by duration', () => {
  const short = aTripView({ name: 'Three days', dayCount: 3 });
  const long = aTripView({ name: 'Eight days', dayCount: 8 });

  // @covers REQ-TRV-077@v1
  test('keeps the 8-Day Trip and drops the 3-Day Trip when the minimum is 6 Days', () => {
    expect(kept({ minDays: 6 }, [short, long])).toEqual(['Eight days']);
  });

  // @covers REQ-TRV-077@v1
  test('includes a Trip of exactly the minimum or the maximum number of Days', () => {
    const five = aTripView({ name: 'Five days', dayCount: 5 });

    expect(kept({ minDays: 5 }, [short, five, long])).toEqual(['Five days', 'Eight days']);
    expect(kept({ maxDays: 5 }, [short, five, long])).toEqual(['Three days', 'Five days']);
    expect(kept({ minDays: 4, maxDays: 5 }, [short, five, long])).toEqual(['Five days']);
  });
});

describe('filtering Trips by Destination, country and budget', () => {
  // @covers REQ-TRV-077@v1
  test('keeps the Kyoto Trip and drops the Paris Trip when the country is Japan', () => {
    const kyoto = aTripView({ name: 'Kyoto trip', destinationName: 'Kyoto', country: 'Japan' });

    expect(kept({ country: 'Japan' }, [kyoto, paris])).toEqual(['Kyoto trip']);
    expect(kept({ country: 'japan' }, [kyoto, paris])).toEqual(['Kyoto trip']);
  });

  // @covers REQ-TRV-077@v1
  test('matches a country as a whole, never as part of a longer name', () => {
    const alps = aTripView({ name: 'Alps', country: 'Japanese Alps' });

    expect(kept({ country: 'Japan' }, [alps, tokyo])).toEqual(['Tokyo Family Holiday']);
  });

  // @covers REQ-TRV-077@v1
  test('keeps only the Trips to the chosen Destination', () => {
    expect(kept({ destination: 'destination-Paris' })).toEqual(['Paris Weekend']);
  });

  // @covers REQ-TRV-077@v1
  test('keeps Trips in the chosen currency whose budget is inside the range, ends included, and drops other currencies', () => {
    const cheap = aTripView({ name: 'Cheap', budget: 1000, currency: 'USD' });
    const middle = aTripView({ name: 'Middle', budget: 3000, currency: 'USD' });
    const dear = aTripView({ name: 'Dear', budget: 9000, currency: 'USD' });
    const yen = aTripView({ name: 'Yen', budget: 3000, currency: 'JPY' });
    const all = [cheap, middle, dear, yen];

    expect(kept({ currency: 'USD', minBudget: 1000, maxBudget: 3000 }, all)).toEqual(['Cheap', 'Middle']);
    expect(kept({ currency: 'USD', minBudget: 3001 }, all)).toEqual(['Dear']);
    expect(kept({ currency: 'JPY' }, all)).toEqual(['Yen']);
  });
});

describe('filtering with several conditions', () => {
  // @covers REQ-TRV-077@v1
  test('keeps only a Trip that meets all of them', () => {
    const match = aTripView({ name: 'Match', travelStyles: ['Family'], dayCount: 7, country: 'Japan' });
    const wrongStyle = aTripView({ name: 'Wrong style', travelStyles: ['Business'], dayCount: 7, country: 'Japan' });
    const tooShort = aTripView({ name: 'Too short', travelStyles: ['Family'], dayCount: 2, country: 'Japan' });
    const elsewhere = aTripView({ name: 'Elsewhere', travelStyles: ['Family'], dayCount: 7, country: 'France' });

    expect(kept({ style: 'Family', minDays: 6, country: 'Japan' }, [match, wrongStyle, tooShort, elsewhere])).toEqual(['Match']);
  });

  // @covers REQ-TRV-077@v1
  test('keeps every Trip, in the order given, when there is no filter at all', () => {
    expect(kept({})).toEqual(['Tokyo Family Holiday', 'Paris Weekend']);
  });
});

describe('reading the filters a Traveler sends', () => {
  const read = (query: Record<string, unknown>) => tripFilterSchema.safeParse(query);
  const refusedField = (query: Record<string, unknown>) => {
    const result = read(query);
    return result.success ? null : (result.error.issues[0]?.path[0] ?? result.error.issues[0]?.code);
  };

  // @covers REQ-TRV-077@v1
  test('reads numbers that arrive as text, and leaves out what was not sent', () => {
    expect(read({ style: 'Family', minDays: '6', currency: 'USD', minBudget: '1000', maxBudget: '3000' })).toMatchObject({
      success: true,
      data: { style: 'Family', minDays: 6, currency: 'USD', minBudget: 1000, maxBudget: 3000 },
    });
    expect(read({})).toEqual({ success: true, data: {} });
  });

  // @covers REQ-TRV-077@v1
  test('treats a parameter that was sent blank as not sent, whichever filter it is', () => {
    const blank = { search: '', destination: '', country: '', style: '', currency: '', minBudget: '', maxBudget: '', minDays: '', maxDays: '' };

    const result = read(blank);

    expect(result.success).toBe(true);
    expect(filterTrips([tokyo, paris], result.success ? result.data : { style: 'Luxury' }).map((t) => t.name)).toEqual(['Tokyo Family Holiday', 'Paris Weekend']);
  });

  // @covers REQ-TRV-077@v1
  test.each([
    ['a fraction of a Day', { minDays: '2.5' }, 'minDays'],
    ['a negative number of Days', { maxDays: '-1' }, 'maxDays'],
    ['words for a number', { minBudget: 'lots', currency: 'USD' }, 'minBudget'],
    ['a travel style that does not exist', { style: 'Sightseeing' }, 'style'],
    ['a currency that does not exist', { currency: 'XYZ' }, 'currency'],
    ['a budget range with no currency', { minBudget: '100' }, 'currency'],
    ['a budget minimum above the maximum', { currency: 'USD', minBudget: '500', maxBudget: '100' }, 'maxBudget'],
    ['a Day minimum above the maximum', { minDays: '9', maxDays: '3' }, 'maxDays'],
    ['a search over 100 characters', { search: 'x'.repeat(101) }, 'search'],
    ['a parameter that is not a filter', { colour: 'red' }, 'colour'],
    ['the same filter twice', { style: ['Family', 'Business'] }, 'style'],
  ])('refuses %s, naming the field', (_name, query, field) => {
    expect(refusedField(query)).toBe(field === 'colour' ? 'unrecognized_keys' : field);
  });
});
