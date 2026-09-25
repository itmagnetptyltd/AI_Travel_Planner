import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PLAN_NOT_AVAILABLE, type AdminPlanView, type AdminTripSummary } from '../../../shared/admin-trips';
import { PLAN_NOT_FOUND } from '../../../shared/plan-schemas';
import { api } from '../../api-client';
import { ReadOnlyPlan } from '../../components/ReadOnlyPlan';
import { tripFeedbackLabel } from './admin-view-state';

type SummaryState =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly trip: AdminTripSummary }
  | { readonly state: 'not-found' }
  | { readonly state: 'failed' };

const NOT_FOUND_STATUS = 404;
const FAILED_MESSAGE = 'This could not be loaded. Reload the page to try again.';

/**
 * One Trip as a summary: who owns it, where, when, for how many, at what budget, its status and its feedback, and no Days or
 * Activities (REQ-TRV-101). The full Plan is offered only when the Trip has feedback (REQ-TRV-070).
 */
export function AdminTripPage() {
  const { id = '' } = useParams();
  return <TripSummary key={id} id={id} />;
}

function TripSummary({ id }: { readonly id: string }) {
  const [shown, setShown] = useState<SummaryState>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    void api<AdminTripSummary>('GET', `/api/admin/trips/${encodeURIComponent(id)}`).then((result) => {
      if (!isCurrent) return;
      if (result.ok) setShown({ state: 'loaded', trip: result.data });
      else setShown({ state: result.status === NOT_FOUND_STATUS ? 'not-found' : 'failed' });
    });
    return () => {
      isCurrent = false;
    };
  }, [id]);

  if (shown.state === 'loading') return <p>Loading…</p>;
  if (shown.state === 'not-found') return <h1>Trip not found</h1>;
  if (shown.state === 'failed') return <p role="alert">{FAILED_MESSAGE}</p>;
  const { trip } = shown;
  return (
    <>
      <h1>{trip.name}</h1>
      <dl>
        <dt>Owner</dt>
        <dd>{trip.owner.email}</dd>
        <dt>Destination</dt>
        <dd>{`${trip.destination.name}, ${trip.destination.country}`}</dd>
        <dt>Dates</dt>
        <dd>{`${trip.startDate} to ${trip.endDate}`}</dd>
        <dt>Travelers</dt>
        <dd>{trip.numberOfTravelers}</dd>
        <dt>Budget</dt>
        <dd>{`${trip.budget} ${trip.currency}`}</dd>
        <dt>Status</dt>
        <dd>{trip.status}</dd>
        <dt>Feedback</dt>
        <dd>{tripFeedbackLabel(trip.feedback)}</dd>
      </dl>
      {trip.feedback ? (
        <p>
          <Link to={`/admin/trips/${encodeURIComponent(trip.id)}/plan`}>Open full Plan</Link>
        </p>
      ) : (
        <p className="muted">The full Plan can be opened only when the Trip has feedback.</p>
      )}
    </>
  );
}

type PlanState =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly view: AdminPlanView }
  | { readonly state: 'refused'; readonly message: string }
  | { readonly state: 'failed' };

/** A Trip's full Plan, read-only, for a Trip that has feedback. Opening it is recorded in the audit log by the server. */
export function AdminTripPlanPage() {
  const { id = '' } = useParams();
  return <TripPlan key={id} id={id} />;
}

function TripPlan({ id }: { readonly id: string }) {
  const [shown, setShown] = useState<PlanState>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    void api<AdminPlanView>('GET', `/api/admin/trips/${encodeURIComponent(id)}/plan`).then((result) => {
      if (!isCurrent) return;
      if (result.ok) setShown({ state: 'loaded', view: result.data });
      else if (result.error.code === PLAN_NOT_AVAILABLE) setShown({ state: 'refused', message: 'The full Plan can be opened only when the Trip has feedback.' });
      else if (result.error.code === PLAN_NOT_FOUND) setShown({ state: 'refused', message: 'This Trip has no Plan yet.' });
      else if (result.status === NOT_FOUND_STATUS) setShown({ state: 'refused', message: 'Trip not found' });
      else setShown({ state: 'failed' });
    });
    return () => {
      isCurrent = false;
    };
  }, [id]);

  if (shown.state === 'loading') return <p>Loading…</p>;
  if (shown.state === 'refused') return <h1>{shown.message}</h1>;
  if (shown.state === 'failed') return <p role="alert">{FAILED_MESSAGE}</p>;
  return (
    <>
      <p>
        <Link to={`/admin/trips/${encodeURIComponent(id)}`}>Back to the Trip’s summary</Link>
      </p>
      <ReadOnlyPlan view={shown.view} />
    </>
  );
}
