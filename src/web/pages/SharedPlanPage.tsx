import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SharedPlanView } from '../../shared/share-schemas';
import { api } from '../api-client';
import { estimateLabel } from '../components/budget-view-state';
import { linkProblemMessage } from '../components/share-view-state';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly view: SharedPlanView }
  | { readonly state: 'refused'; readonly status: number };

function SharedPlan({ view }: { readonly view: SharedPlanView }) {
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

/**
 * What a link in a shared or emailed Plan opens: the Trip's Plan, read-only, with no login (REQ-TRV-058). There is nothing
 * on the page to change, and a link that is expired, revoked or wrong shows one sentence and nothing of the Plan.
 * Each link is read from a state of its own, so one link's Plan is never on show while another is being opened.
 */
export function SharedPlanPage() {
  const { token = '' } = useParams();
  return <SharedPlanLoader key={token} token={token} />;
}

function SharedPlanLoader({ token }: { readonly token: string }) {
  const [shown, setShown] = useState<State>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    void api<SharedPlanView>('GET', `/api/shared/${encodeURIComponent(token)}`).then((result) => {
      if (isCurrent) setShown(result.ok ? { state: 'loaded', view: result.data } : { state: 'refused', status: result.status });
    });
    return () => {
      isCurrent = false;
    };
  }, [token]);

  if (shown.state === 'loading') return <p>Loading…</p>;
  if (shown.state === 'refused') return <h1>{linkProblemMessage(shown.status)}</h1>;
  return <SharedPlan view={shown.view} />;
}
