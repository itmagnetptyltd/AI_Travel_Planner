import { PLAN_RECOMMENDATION_NOTICE } from '../../shared/plan-notice';
import type { PlanView } from '../../shared/plan-schemas';
import { costLabel, dayButtonLabel, dayHeading } from '../pages/plan-view-state';
import { ActivityItem } from './ActivityItem';
import type { PlanActions } from './plan-actions';

/**
 * A saved Plan, always with the notice that it is a recommendation (REQ-TRV-031). Every Day offers to be
 * regenerated, or generated if the Trip grew and it is still empty. The button sits after the Day, not in
 * it, so a Day's own controls are its Activities.
 */
export function PlanDisplay({ plan, actions }: { readonly plan: PlanView; readonly actions: PlanActions }) {
  const { stay } = plan;
  return (
    <section aria-labelledby="plan-heading">
      <h2 id="plan-heading">Plan</h2>
      <p className="plan-notice">{PLAN_RECOMMENDATION_NOTICE}</p>
      <h3>Where to stay</h3>
      <p>
        {`${stay.accommodationType} in ${stay.suggestedArea}, about ${costLabel(stay.nightlyCostEstimate, plan.currency)} per night`}
      </p>
      {plan.days.map((day) => (
        <div key={day.dayNumber}>
          <section aria-label={dayHeading(day)}>
            <h3>{dayHeading(day)}</h3>
            {day.activities.length === 0 ? <p className="muted">No Activities on this Day yet.</p> : null}
            <ul>
              {day.activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} plan={plan} actions={actions} />
              ))}
            </ul>
          </section>
          <button type="button" disabled={actions.isBusy} onClick={() => actions.onRegenerateDay(day.dayNumber)}>
            {dayButtonLabel(day)}
          </button>
        </div>
      ))}
    </section>
  );
}
