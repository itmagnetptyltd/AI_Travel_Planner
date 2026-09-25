import { useId, useState } from 'react';
import type { PlanActivity, PlanDay, PlanView } from '../../shared/plan-schemas';
import { activityDetailRows, activityHeading, dayHeading } from '../pages/plan-view-state';
import { changesMade, valuesFromActivity, type ActivityFormValues } from './activity-form-state';
import { ActivityForm } from './ActivityForm';
import type { PlanActions } from './plan-actions';
import { ReplaceActivityPanel } from './ReplaceActivityPanel';

type Panel = 'edit' | 'move' | 'replace' | null;

function EditPanel({ activity, actions, onDone }: { readonly activity: PlanActivity; readonly actions: PlanActions; readonly onDone: () => void }) {
  // What the Activity was when the form opened, so a Plan that changes underneath cannot make an untouched field look edited.
  const [original] = useState(() => valuesFromActivity(activity));
  const [values, setValues] = useState<ActivityFormValues>(original);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const changes = changesMade(original, values);
    if (Object.keys(changes).length === 0) return onDone();
    const failure = await actions.onEdit(activity.id, changes);
    if (failure === null) onDone();
    else setProblem(failure);
  };

  return (
    <ActivityForm
      name="Edit Activity"
      values={values}
      onChange={(field, value) => setValues({ ...values, [field]: value })}
      onSubmit={() => void save()}
      submitLabel="Save Activity"
      onCancel={onDone}
      isBusy={actions.isBusy}
      problem={problem}
    />
  );
}

function MovePanel({ activity, days, actions, onDone }: {
  readonly activity: PlanActivity;
  readonly days: readonly PlanDay[];
  readonly actions: PlanActions;
  readonly onDone: () => void;
}) {
  const selectId = useId();
  const others = days.filter((day) => !day.activities.some((candidate) => candidate.id === activity.id));
  const [toDay, setToDay] = useState(String(others[0]?.dayNumber ?? ''));
  const [problem, setProblem] = useState<string | null>(null);

  const move = async () => {
    const failure = await actions.onMove(activity.id, Number(toDay));
    if (failure !== null) setProblem(failure);
  };
  return (
    <div>
      <label htmlFor={selectId}>Move to</label>
      <select id={selectId} value={toDay} onChange={(event) => setToDay(event.target.value)}>
        {others.map((day) => (
          <option key={day.dayNumber} value={day.dayNumber}>
            {dayHeading(day)}
          </option>
        ))}
      </select>
      <button type="button" disabled={actions.isBusy || toDay === ''} onClick={() => void move()}>
        Move
      </button>
      <button type="button" onClick={onDone}>
        Cancel
      </button>
      {problem ? <p role="alert">{problem}</p> : null}
    </div>
  );
}

/**
 * One Activity on a Day. Its heading opens the details and, with them, what the Traveler can do to it:
 * change it, move it to another Day, replace it, or remove it. Regenerating is offered for a whole Plan
 * and for a Day, never for a single Activity (REQ-TRV-042).
 */
export function ActivityItem({ activity, plan, actions }: {
  readonly activity: PlanActivity;
  readonly plan: PlanView;
  readonly actions: PlanActions;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const detailsId = useId();

  const remove = async () => {
    const failure = await actions.onRemove(activity.id);
    if (failure !== null) setProblem(failure);
  };
  const show = (next: Panel) => () => {
    setProblem(null);
    setPanel(next);
  };
  const close = () => setPanel(null);

  return (
    <li>
      <button type="button" aria-expanded={isOpen} aria-controls={detailsId} onClick={() => setIsOpen(!isOpen)}>
        {activityHeading(activity)}
      </button>{' '}
      <span className="muted">{activity.category}</span>
      {isOpen ? (
        <div id={detailsId}>
          <dl>
            {activityDetailRows(activity, plan.currency).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <button type="button" disabled={actions.isBusy} onClick={show('edit')}>
            Edit
          </button>
          <button type="button" disabled={actions.isBusy} onClick={show('move')}>
            Move to another Day
          </button>
          <button type="button" disabled={actions.isBusy} onClick={show('replace')}>
            Replace this Activity
          </button>
          <button type="button" disabled={actions.isBusy} onClick={() => void remove()}>
            Remove
          </button>
          {problem ? <p role="alert">{problem}</p> : null}
          {panel === 'edit' ? <EditPanel activity={activity} actions={actions} onDone={close} /> : null}
          {panel === 'move' ? <MovePanel activity={activity} days={plan.days} actions={actions} onDone={close} /> : null}
          {panel === 'replace' ? <ReplaceActivityPanel activity={activity} actions={actions} onDone={close} /> : null}
        </div>
      ) : null}
    </li>
  );
}
