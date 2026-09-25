import type { SharedPlanView } from '../../shared/share-schemas';
import { estimateLabel } from './budget-view-state';

/**
 * A Trip's Plan drawn to be read and not changed: no button, no field. It is what a shared link opens (REQ-TRV-058) and what
 * an Administrator sees of a Trip that has feedback (REQ-TRV-070), so the two cannot drift apart.
 */
export function ReadOnlyPlan({ view }: { readonly view: Pick<SharedPlanView, 'trip' | 'plan' | 'estimates' | 'notice'> }) {
  const { plan, trip, estimates } = view;
  return (
    <>
      <h1>{trip.name}</h1>
      <p>{`${trip.destination.name}, ${trip.destination.country}, ${trip.startDate} to ${trip.endDate}`}</p>
      <p className="plan-notice">{view.notice}</p>
      <h2>Where to stay</h2>
      <p>{`${plan.stay.accommodationType} in ${plan.stay.suggestedArea}, about ${estimateLabel(plan.stay.nightlyCostEstimate, plan.currency)} per night`}</p>
      {plan.days.map((day) => (
        <section key={day.dayNumber} aria-label={`Day ${day.dayNumber}, ${day.date}`}>
          <h2>{`Day ${day.dayNumber}, ${day.date}`}</h2>
          {day.activities.length === 0 ? (
            <p className="muted">Nothing planned yet.</p>
          ) : (
            <ul>
              {day.activities.map((activity, index) => (
                <li key={`${index}-${activity.startTime}`}>
                  <strong>{`${activity.startTime} ${activity.title}`}</strong>
                  {`, ${activity.location}. About ${estimateLabel(activity.estimatedCost, plan.currency)}. ${activity.reason}`}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <h2>Estimated costs</h2>
      <dl>
        {estimates.estimates.map((estimate) => (
          <div key={estimate.category}>
            <dt>{estimate.category}</dt>
            <dd>{estimateLabel(estimate.amount, estimates.currency)}</dd>
          </div>
        ))}
        <div>
          <dt>Estimated total</dt>
          <dd>{estimateLabel(estimates.total, estimates.currency)}</dd>
        </div>
      </dl>
    </>
  );
}
