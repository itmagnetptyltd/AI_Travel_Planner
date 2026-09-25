import type { TripBudget } from '../../shared/trip-budget';
import { BUDGET_COVERAGE_NOTE, budgetLabel, differenceLabel, estimateLabel, perPersonLabel } from './budget-view-state';
import { useBudget } from './use-budget';

function Figures({ budget }: { readonly budget: TripBudget }) {
  return (
    <>
      <p>{BUDGET_COVERAGE_NOTE}</p>
      <dl>
        {budget.estimates.map((estimate) => (
          <div key={estimate.category}>
            <dt>{estimate.category}</dt>
            <dd>{estimateLabel(estimate.amount, budget.currency)}</dd>
          </div>
        ))}
        <div>
          <dt>Estimated total</dt>
          <dd>{estimateLabel(budget.total, budget.currency)}</dd>
        </div>
        <div>
          <dt>Budget</dt>
          <dd>{budgetLabel(budget)}</dd>
        </div>
      </dl>
      <p>{differenceLabel(budget)}</p>
      <p className="muted">{perPersonLabel(budget)}</p>
    </>
  );
}

/**
 * What the Trip's Plan is estimated to cost: an estimate for each of six categories, their total, and how that
 * stands against the budget (REQ-TRV-049 to REQ-TRV-051). It is read from the saved Plan, so it changes when the
 * Plan does and not otherwise, and it never asks the AI. The section stays in place while it is read again, so
 * the page below it does not jump, and figures for an earlier Plan are never shown.
 */
export function BudgetPanel({ tripId, planVersion }: { readonly tripId: string; readonly planVersion: number }) {
  const result = useBudget(tripId, planVersion);
  return (
    <section aria-labelledby="budget-heading" aria-busy={result.state === 'loading'}>
      <h2 id="budget-heading">Estimated costs</h2>
      {result.state === 'loading' ? <p className="muted">Updating the estimates…</p> : null}
      {result.state === 'failed' ? <p role="alert">The budget could not be shown. Reload the page to try again.</p> : null}
      {result.state === 'loaded' ? <Figures budget={result.budget} /> : null}
    </section>
  );
}
