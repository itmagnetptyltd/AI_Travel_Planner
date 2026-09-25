import { describe, expect, test } from 'vitest';
import { CURRENCIES } from '../../src/shared/currencies';
import { tripInputSchema } from '../../src/shared/trip-schemas';
import { aTripInput } from '../support/a-trip';

const firstInvalidField = (input: unknown): string | undefined => {
  const result = tripInputSchema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.path.join('.');
};

describe('required Trip details', () => {
  // @covers REQ-TRV-011@v2
  test.each(['name', 'destinationId', 'startDate', 'endDate', 'adults', 'budget', 'currency'] as const)(
    'a Trip with %s blank is refused, naming it',
    (field) => {
      const input = { ...aTripInput('tokyo'), [field]: undefined };

      expect(firstInvalidField(input)).toBe(field);
    },
  );

  // @covers REQ-TRV-011@v2
  test('a Trip with an empty name is refused, naming name', () => {
    expect(firstInvalidField(aTripInput('tokyo', { name: '  ' }))).toBe('name');
  });

  // @covers REQ-TRV-011@v2
  test('a Trip with 0 adults is refused, naming adults', () => {
    expect(firstInvalidField(aTripInput('tokyo', { adults: 0 }))).toBe('adults');
  });

  // @covers REQ-TRV-011@v2
  test('the currencies offered are exactly AUD, USD, EUR, GBP, JPY, SGD, NZD and BDT', () => {
    expect(CURRENCIES).toEqual(['AUD', 'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'NZD', 'BDT']);
  });

  // @covers REQ-TRV-011@v2
  test('a Trip with currency CAD is refused, naming currency', () => {
    expect(firstInvalidField({ ...aTripInput('tokyo'), currency: 'CAD' })).toBe('currency');
  });

  // @covers REQ-TRV-011@v2
  test('a Trip with numberOfTravelers supplied is still accepted', () => {
    expect(firstInvalidField(aTripInput('tokyo', { numberOfTravelers: 5 }))).toBeUndefined();
  });
});

describe('Trip date rules', () => {
  // @covers REQ-TRV-012@v2
  test('an end date before the start date is refused, naming endDate', () => {
    expect(firstInvalidField(aTripInput('tokyo', { startDate: '2026-10-17', endDate: '2026-10-10' }))).toBe('endDate');
  });

  // @covers REQ-TRV-012@v2
  test('a 14-Day Trip is accepted', () => {
    expect(firstInvalidField(aTripInput('tokyo', { startDate: '2026-10-01', endDate: '2026-10-14' }))).toBeUndefined();
  });

  // @covers REQ-TRV-012@v2
  test('a 15-Day Trip is refused, naming endDate', () => {
    expect(firstInvalidField(aTripInput('tokyo', { startDate: '2026-10-01', endDate: '2026-10-15' }))).toBe('endDate');
  });

  // @covers REQ-TRV-012@v2
  test('a date that is not a calendar date is refused, naming it', () => {
    expect(firstInvalidField(aTripInput('tokyo', { startDate: '2026-02-30' }))).toBe('startDate');
  });
});

describe('budget', () => {
  // @covers REQ-TRV-013@v1
  test('a budget of -100 is refused, naming budget', () => {
    expect(firstInvalidField(aTripInput('tokyo', { budget: -100 }))).toBe('budget');
  });
});
