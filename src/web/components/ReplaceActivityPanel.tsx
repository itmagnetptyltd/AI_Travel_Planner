import { useState } from 'react';
import type { PlanActivity } from '../../shared/plan-schemas';
import { activityHeading } from '../pages/plan-view-state';
import {
  EMPTY_ACTIVITY_FORM,
  newActivityPayload,
  valuesFromActivity,
  type ActivityFormField,
  type ActivityFormValues,
} from './activity-form-state';
import { ActivityForm } from './ActivityForm';
import type { PlanActions, SuggestedActivity } from './plan-actions';

/**
 * Two ways to replace an Activity: ask the AI for one, which counts against the daily limit, or type your
 * own, which never does (REQ-TRV-047). A suggestion is only shown; nothing changes until it is accepted.
 */
export function ReplaceActivityPanel({ activity, actions, onDone }: {
  readonly activity: PlanActivity;
  readonly actions: PlanActions;
  readonly onDone: () => void;
}) {
  const [values, setValues] = useState<ActivityFormValues>(EMPTY_ACTIVITY_FORM);
  const [suggestion, setSuggestion] = useState<SuggestedActivity | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  const replaceWith = async (payload: Record<string, string | number | boolean>) => {
    const failure = await actions.onReplace(activity.id, payload);
    if (failure === null) onDone();
    else setProblem(failure);
  };

  const ask = async () => {
    setProblem(null);
    setIsAsking(true);
    const answer = await actions.onSuggest(activity.id);
    setIsAsking(false);
    if (answer.ok) setSuggestion(answer.activity);
    else setProblem(answer.problem);
  };

  return (
    <div>
      <h4>Replace this Activity</h4>
      <button type="button" disabled={actions.isBusy || isAsking} onClick={() => void ask()}>
        Ask the AI for a suggestion
      </button>
      {isAsking ? <p role="status">Asking the AI for a suggestion…</p> : null}
      {suggestion ? (
        <div role="group" aria-label="AI suggestion">
          <p>{activityHeading(suggestion)}</p>
          <p className="muted">{`${suggestion.location}. ${suggestion.reason}`}</p>
          <button
            type="button"
            disabled={actions.isBusy}
            onClick={() => void replaceWith(newActivityPayload(valuesFromActivity(suggestion), { fromSuggestion: true, reason: suggestion.reason }))}
          >
            Use this suggestion
          </button>
          <button type="button" onClick={() => setSuggestion(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      <ActivityForm
        name="Type your own Activity"
        values={values}
        onChange={(field: ActivityFormField, value: string) => setValues({ ...values, [field]: value })}
        onSubmit={() => void replaceWith(newActivityPayload(values))}
        submitLabel="Use my Activity"
        isBusy={actions.isBusy || isAsking}
        problem={problem}
      />
    </div>
  );
}
