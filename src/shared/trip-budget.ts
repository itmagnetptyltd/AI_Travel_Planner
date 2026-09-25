import type { Currency } from './currencies';
import { ACTIVITY_CATEGORIES, type ActivityCategory, type PlanView } from './plan-schemas';

/** The six categories of REQ-TRV-049, in the order they are shown. Accommodation comes from the stay, the rest from Activities. */
export const BUDGET_CATEGORIES = ['Accommodation', ...ACTIVITY_CATEGORIES] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export interface CategoryEstimate {
  readonly category: BudgetCategory;
  readonly amount: number;
}

/** What a saved Plan is estimated to cost, in the Plan's own currency. Nothing here is a price, only an estimate. */
export interface PlanEstimates {
  readonly currency: Currency;
  readonly estimates: readonly CategoryEstimate[];
  readonly total: number;
}

/** The parts of a Trip its budget is worked out from. */
export interface BudgetTrip {
  readonly budget: number;
  readonly currency: Currency;
  readonly adults: number;
  readonly children: number;
}

export interface TripBudget extends PlanEstimates {
  readonly budget: number;
  readonly budgetCurrency: Currency;
  /** The estimated total minus the budget: above 0 is over budget. Null when the Plan is in another currency, since nothing converts. */
  readonly difference: number | null;
  /** The budget shared by every traveler, to a whole unit, for information only (ANSWERS.md, "What the budget covers"). */
  readonly perPerson: number;
  readonly travelers: number;
}

/** A Trip of N Days is N - 1 nights; a 1-Day Trip has no accommodation to pay for. */
const nightsOf = (plan: PlanView): number => Math.max(0, plan.days.length - 1);

const activityTotal = (plan: PlanView, category: ActivityCategory): number =>
  plan.days.reduce(
    (sum, day) => sum + day.activities.filter((activity) => activity.category === category).reduce((each, activity) => each + activity.estimatedCost, 0),
    0,
  );

/**
 * The cost estimates in a saved Plan. They are the Plan's own numbers added up, so they cannot disagree with it, they
 * change when the Plan does (an edit, a removal, an accepted chat change) and not otherwise, and they cost no AI request.
 */
export function estimatesOf(plan: PlanView): PlanEstimates {
  const amountOf = (category: BudgetCategory): number =>
    category === 'Accommodation' ? plan.stay.nightlyCostEstimate * nightsOf(plan) : activityTotal(plan, category);
  const estimates = BUDGET_CATEGORIES.map((category) => ({ category, amount: amountOf(category) }));
  return { currency: plan.currency, estimates, total: estimates.reduce((sum, estimate) => sum + estimate.amount, 0) };
}

export function budgetOf(plan: PlanView, trip: BudgetTrip): TripBudget {
  const { currency, estimates, total } = estimatesOf(plan);
  const travelers = trip.adults + trip.children;
  return {
    currency,
    estimates,
    total,
    budget: trip.budget,
    budgetCurrency: trip.currency,
    difference: currency === trip.currency ? total - trip.budget : null,
    perPerson: travelers > 0 ? Math.round(trip.budget / travelers) : 0,
    travelers,
  };
}
