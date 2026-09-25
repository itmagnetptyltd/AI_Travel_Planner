import { useId, useState } from 'react';
import { PLAN_RECOMMENDATION_NOTICE } from '../../shared/plan-notice';
import type { PlanActivity, PlanView } from '../../shared/plan-schemas';
import { activityDetailRows, costLabel, dayHeading } from '../pages/plan-view-state';

function ActivityItem({ activity, currency }: { readonly activity: PlanActivity; readonly currency: PlanView['currency'] }) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsId = useId();
  return (
    <li>
      <button type="button" aria-expanded={isOpen} aria-controls={detailsId} onClick={() => setIsOpen(!isOpen)}>
        {`${activity.startTime} ${activity.title}`}
      </button>{' '}
      <span className="muted">{activity.category}</span>
      {isOpen ? (
        <dl id={detailsId}>
          {activityDetailRows(activity, currency).map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

/** A generated Plan, always with the notice that it is a recommendation (REQ-TRV-031). */
export function PlanDisplay({ plan }: { readonly plan: PlanView }) {
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
        <section key={day.dayNumber} aria-label={dayHeading(day)}>
          <h3>{dayHeading(day)}</h3>
          <ul>
            {day.activities.map((activity, index) => (
              <ActivityItem key={`${activity.startTime}-${index}`} activity={activity} currency={plan.currency} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
