import { useState } from 'react';
import type { PlanView } from '../../shared/plan-schemas';
import { api } from '../api-client';
import { planStateAfter, type PlanState } from '../pages/plan-view-state';
import { PlanDisplay } from './PlanDisplay';

/**
 * Asks the AI for a Plan only when the Traveler presses the button, never when the page opens.
 * When the AI fails the Traveler sees the fallback message and nothing else: there is no way to
 * build a Plan by hand in this build.
 */
export function PlanGenerator({ tripId }: { readonly tripId: string }) {
  const [state, setState] = useState<PlanState>({ kind: 'idle' });

  const generate = async () => {
    setState({ kind: 'generating' });
    setState(planStateAfter(await api<PlanView>('POST', `/api/trips/${encodeURIComponent(tripId)}/plan`)));
  };

  const isGenerating = state.kind === 'generating';
  return (
    <>
      <button type="button" disabled={isGenerating} onClick={() => void generate()}>
        Generate Plan
      </button>
      {isGenerating ? <p role="status">Generating your Plan… this can take up to two minutes.</p> : null}
      {state.kind === 'refused' || state.kind === 'failed' ? <p role="alert">{state.message}</p> : null}
      {state.kind === 'shown' ? <PlanDisplay plan={state.plan} /> : null}
    </>
  );
}
