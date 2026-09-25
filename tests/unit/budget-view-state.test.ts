import { describe, expect, test } from 'vitest';
import type { TripBudget } from '../../src/shared/trip-budget';
import {
  BUDGET_COVERAGE_NOTE,
  budgetLabel,
  differenceLabel,
  estimateLabel,
  perPersonLabel,
  totalChangeLabel,
} from '../../src/web/components/budget-view-state';

const budget = (overrides: Partial<TripBudget> = {}): TripBudget => ({
  currency: 'USD',
  estimates: [],
  total: 5600,
  budget: 5000,
  budgetCurrency: 'USD',
  difference: 600,
  perPerson: 1250,
  travelers: 4,
  ...overrides,
});

describe('what the budget says about the total', () => {
  // @covers REQ-TRV-051@v1
  test('says "600 USD over budget" when the total is 600 above the budget', () => {
    expect(differenceLabel(budget())).toBe('600 USD over budget');
  });

  // @covers REQ-TRV-051@v1
  test('says how far under budget it is, and when it is exactly on budget', () => {
    expect(differenceLabel(budget({ total: 4550, difference: -450 }))).toBe('450 USD under budget');
    expect(differenceLabel(budget({ total: 5000, difference: 0 }))).toBe('Exactly on budget');
  });

  // @covers REQ-TRV-051@v1
  test('says the two are not compared when the Plan and the budget are in different currencies', () => {
    const label = differenceLabel(budget({ currency: 'EUR', budgetCurrency: 'USD', difference: null }));

    expect(label).toContain('EUR');
    expect(label).toContain('USD');
    expect(label).toMatch(/not compared/i);
  });

  // @covers REQ-TRV-051@v1
  test('shows the Trip budget in the currency it was set in', () => {
    expect(budgetLabel(budget())).toBe('5000 USD');
  });

  // @covers REQ-TRV-051@v1
  test('labels the per-person budget as for information only', () => {
    expect(perPersonLabel(budget())).toBe('1250 USD per person, for information only');
  });

  // @covers REQ-TRV-051@v1
  test('states the budget is one total for the whole group, covering the Destination only and not travel to or from it', () => {
    expect(BUDGET_COVERAGE_NOTE).toMatch(/one total for the whole group/);
    expect(BUDGET_COVERAGE_NOTE).toMatch(/at the Destination only/);
    expect(BUDGET_COVERAGE_NOTE).toMatch(/not include travel to and from/);
  });
});

describe('how an estimate is labelled', () => {
  // @covers REQ-TRV-049@v1
  test('says every estimate is an estimate and not a price', () => {
    expect(estimateLabel(1050, 'USD')).toBe('1050 USD (an estimate, not a price)');
  });
});

describe('what a chat suggestion says about the total', () => {
  // @covers REQ-TRV-053@v1
  test('shows the new total beside the previous one: 4800 (was 5600)', () => {
    expect(totalChangeLabel({ before: 5600, after: 4800 }, 'USD')).toBe('Estimated total 4800 USD (was 5600 USD)');
  });

  // @covers REQ-TRV-053@v1
  test('says nothing when the change moves no cost, or when the suggestion was made before totals were kept', () => {
    expect(totalChangeLabel({ before: 5600, after: 5600 }, 'USD')).toBeNull();
    expect(totalChangeLabel(undefined, 'USD')).toBeNull();
  });
});
