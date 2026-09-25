import { describe, expect, test } from 'vitest';
import { moveActivity, removeActivity, replaceActivity } from '../../src/server/plans/plan-edit';
import { BUDGET_CATEGORIES, budgetOf, estimatesOf, type BudgetCategory } from '../../src/shared/trip-budget';
import type { PlanView } from '../../src/shared/plan-schemas';
import { aPlanCosting, COSTS_TOTALLING_5600 } from '../support/a-budget';

const TRIP = { budget: 5000, currency: 'USD', adults: 2, children: 2 } as const;

const amountOf = (plan: PlanView, category: (typeof BUDGET_CATEGORIES)[number]): number | undefined =>
  estimatesOf(plan).estimates.find((estimate) => estimate.category === category)?.amount;

describe('the estimate for each of six categories', () => {
  // @covers REQ-TRV-049@v1
  test('gives an estimate for accommodation, food, transportation, activities, shopping and other, in that order', () => {
    const { estimates } = estimatesOf(aPlanCosting({ costs: COSTS_TOTALLING_5600 }));

    expect(estimates.map((estimate) => estimate.category)).toEqual([
      'Accommodation', 'Food', 'Transportation', 'Activities', 'Shopping', 'Other',
    ]);
  });

  // @covers REQ-TRV-049@v1
  test('gives the Plan\'s own currency, so a JPY Plan is estimated in JPY', () => {
    const plan: PlanView = { ...aPlanCosting({ costs: { Food: 4000 } }), currency: 'JPY' };

    expect(estimatesOf(plan).currency).toBe('JPY');
  });

  // @covers REQ-TRV-049@v1
  test('adds Food Activities of 40 and 60 into a food estimate of 100', () => {
    expect(amountOf(aPlanCosting({ costs: { Food: [40, 60] } }), 'Food')).toBe(100);
  });

  // @covers REQ-TRV-049@v1
  test('multiplies a stay of 150 a night by the 7 nights of an 8-Day Trip into 1050', () => {
    expect(amountOf(aPlanCosting({ days: 8, nightly: 150 }), 'Accommodation')).toBe(1050);
  });

  // @covers REQ-TRV-049@v1
  test('gives a 1-Day Trip no accommodation cost', () => {
    expect(amountOf(aPlanCosting({ days: 1, nightly: 150, costs: { Food: 30 } }), 'Accommodation')).toBe(0);
  });

  // @covers REQ-TRV-049@v1
  test('gives a category with no Activity an estimate of 0', () => {
    expect(amountOf(aPlanCosting({ costs: { Food: 30 } }), 'Shopping')).toBe(0);
  });

  // @covers REQ-TRV-049@v1
  test('counts an empty Day as costing nothing, though its night is still paid for', () => {
    const plan = aPlanCosting({ days: 3, nightly: 100, costs: { Food: 30 } });
    const withEmptyDay = { ...plan, days: plan.days.map((day) => (day.dayNumber === 3 ? { ...day, activities: [] } : day)) };

    expect(estimatesOf(withEmptyDay)).toMatchObject({ total: 230 });
  });

  // @covers REQ-TRV-049@v1
  test('gives a Plan with no Days no cost at all rather than a negative one', () => {
    expect(estimatesOf({ ...aPlanCosting(), days: [] }).total).toBe(0);
  });

  // @covers REQ-TRV-049@v1
  test('adds costs at the largest an Activity may have (10,000,000) exactly', () => {
    expect(amountOf(aPlanCosting({ costs: { Shopping: [10_000_000, 10_000_000] } }), 'Shopping')).toBe(20_000_000);
  });

  // @covers REQ-TRV-049@v1
  test('counts an Activity in the category it carries and in no other', () => {
    const plan = aPlanCosting({ costs: { Shopping: 70 } });

    expect(amountOf(plan, 'Shopping')).toBe(70);
    const others: readonly BudgetCategory[] = ['Food', 'Transportation', 'Activities', 'Other'];
    expect(others.map((category) => amountOf(plan, category))).toEqual([0, 0, 0, 0]);
  });

  // @covers REQ-TRV-049@v1
  test('gives the total of 5600 the saved Plan holds, and leaves the Plan as it was', () => {
    const plan = aPlanCosting({ costs: COSTS_TOTALLING_5600 });
    const before = structuredClone(plan);

    expect(estimatesOf(plan).total).toBe(5600);
    expect(plan).toEqual(before);
  });
});

describe('the estimated total', () => {
  // @covers REQ-TRV-050@v1
  test('is 3200 for estimates of 1000, 800, 400, 600, 300 and 100', () => {
    const plan = aPlanCosting({ days: 5, nightly: 250, costs: { Food: 800, Transportation: 400, Activities: 600, Shopping: 300, Other: 100 } });

    const { estimates, total } = estimatesOf(plan);

    expect(estimates.map((estimate) => estimate.amount)).toEqual([1000, 800, 400, 600, 300, 100]);
    expect(total).toBe(3200);
  });

  // @covers REQ-TRV-050@v1
  test('is always the sum of the six estimates it is shown beside', () => {
    const plan = aPlanCosting({ costs: { Food: [12, 7], Activities: [33], Other: 5 } });

    const { estimates, total } = estimatesOf(plan);

    expect(total).toBe(estimates.reduce((sum, estimate) => sum + estimate.amount, 0));
  });
});

describe('the total against the budget', () => {
  // @covers REQ-TRV-051@v1
  test('is 600 over a budget of 5000 when the total is 5600', () => {
    const result = budgetOf(aPlanCosting({ costs: COSTS_TOTALLING_5600 }), TRIP);

    expect(result).toMatchObject({ total: 5600, budget: 5000, difference: 600 });
  });

  // @covers REQ-TRV-051@v1
  test('tells a total under the budget, and one exactly on it, from one over', () => {
    const under = budgetOf(aPlanCosting({ costs: { Food: 1000 } }), TRIP);
    const exactly = budgetOf(aPlanCosting({ costs: { Food: 3950 } }), TRIP);

    expect(under.difference).toBe(-2950);
    expect(exactly.difference).toBe(0);
  });

  // @covers REQ-TRV-051@v1
  test('gives 1250 per person for a budget of 5000 shared by 2 adults and 2 children', () => {
    expect(budgetOf(aPlanCosting(), TRIP)).toMatchObject({ perPerson: 1250, travelers: 4 });
  });

  // @covers REQ-TRV-051@v1
  test('rounds the per-person figure to a whole unit: 5000 for 3 people is 1667', () => {
    expect(budgetOf(aPlanCosting(), { ...TRIP, adults: 3, children: 0 }).perPerson).toBe(1667);
  });

  // @covers REQ-TRV-051@v1
  test('gives no difference when the Plan is in another currency than the Trip, because nothing converts one to the other', () => {
    const plan: PlanView = { ...aPlanCosting({ costs: COSTS_TOTALLING_5600 }), currency: 'EUR' };

    const result = budgetOf(plan, TRIP);

    expect(result.difference).toBeNull();
    expect(result).toMatchObject({ currency: 'EUR', budget: 5000, budgetCurrency: 'USD' });
  });
});

describe('the activities estimate after an edit', () => {
  const plan = aPlanCosting({ costs: { Activities: [550, 50] } });

  // @covers REQ-TRV-052@v1
  test('goes from 600 to 550 when the Activity of 50 is removed', () => {
    expect(amountOf(plan, 'Activities')).toBe(600);
    const edited = removeActivity(plan, 'Activities-2');
    if (!edited.ok) throw new Error(edited.error);

    expect(amountOf(edited.plan, 'Activities')).toBe(550);
  });

  // @covers REQ-TRV-052@v1
  test('goes to 630 when the Activity of 50 is replaced by a typed one estimated at 80', () => {
    const edited = replaceActivity(
      plan,
      'Activities-2',
      { title: 'Sunrise swim', startTime: '09:00', durationMinutes: 45, estimatedCost: 80, location: 'Kamo river' },
      'typed',
    );
    if (!edited.ok) throw new Error(edited.error);

    expect(amountOf(edited.plan, 'Activities')).toBe(630);
  });

  // @covers REQ-TRV-052@v1
  test('does not change any estimate when an Activity is moved to another Day', () => {
    const moved = moveActivity(plan, 'Activities-2', 2);
    if (!moved.ok) throw new Error(moved.error);

    expect(estimatesOf(moved.plan)).toEqual(estimatesOf(plan));
  });
});
