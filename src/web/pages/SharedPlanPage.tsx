import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SharedPlanView } from '../../shared/share-schemas';
import { api } from '../api-client';
import { ReadOnlyPlan } from '../components/ReadOnlyPlan';
import { linkProblemMessage } from '../components/share-view-state';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly view: SharedPlanView }
  | { readonly state: 'refused'; readonly status: number };

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
  return <ReadOnlyPlan view={shown.view} />;
}
