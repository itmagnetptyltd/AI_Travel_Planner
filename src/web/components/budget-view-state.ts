import type { Currency } from '../../shared/currencies';
import type { EstimatedTotals } from '../../shared/chat-schemas';
import type { TripBudget } from '../../shared/trip-budget';
import { costLabel } from '../pages/plan-view-state';

/** What the budget is, said beside it (ANSWERS.md, "What the budget covers"; REQ-TRV-051). */
export const BUDGET_COVERAGE_NOTE =
  'The budget is one total for the whole group. It covers costs at the Destination only (accommodation, food, local transportation, activities, shopping and other) and does not include travel to and from the Destination.';

/** Every figure is an estimate, never a price (REQ-TRV-049). */
export const estimateLabel = costLabel;

/** The Trip's own budget, in the currency it was set in. */
export const budgetLabel = (budget: Pick<TripBudget, 'budget' | 'budgetCurrency'>): string => `${budget.budget} ${budget.budgetCurrency}`;

/** How the estimated total stands against the budget, in words. */
export function differenceLabel(budget: Pick<TripBudget, 'difference' | 'currency' | 'budgetCurrency'>): string {
  const { difference, currency, budgetCurrency } = budget;
  if (difference === null) {
    return `The Plan is estimated in ${currency} and the budget is in ${budgetCurrency}, so they are not compared.`;
  }
  if (difference === 0) return 'Exactly on budget';
  return `${Math.abs(difference)} ${budgetCurrency} ${difference > 0 ? 'over' : 'under'} budget`;
}

export const perPersonLabel = (budget: Pick<TripBudget, 'perPerson' | 'budgetCurrency'>): string =>
  `${budget.perPerson} ${budget.budgetCurrency} per person, for information only`;

/** The new estimated total beside the previous one, or null when the change moves no cost (REQ-TRV-053). */
export function totalChangeLabel(totals: EstimatedTotals | undefined, currency: Currency): string | null {
  if (!totals || totals.before === totals.after) return null;
  return `Estimated total ${totals.after} ${currency} (was ${totals.before} ${currency})`;
}
