import type { FormEvent } from 'react';
import { ACTIVITY_FORM_FIELDS, type ActivityFormField, type ActivityFormValues } from './activity-form-state';
import { FormField } from './FormField';

const LABELS: Readonly<Record<ActivityFormField, string>> = {
  title: 'Title',
  startTime: 'Start time',
  durationMinutes: 'Duration (minutes)',
  estimatedCost: 'Estimated cost',
  location: 'Location',
};

interface ActivityFormProps {
  /** Names the form, so the Traveler and a screen reader can tell an edit from a typed replacement. */
  readonly name: string;
  readonly values: ActivityFormValues;
  readonly onChange: (field: ActivityFormField, value: string) => void;
  readonly onSubmit: () => void;
  readonly submitLabel: string;
  readonly onCancel?: () => void;
  readonly isBusy: boolean;
  readonly problem: string | null;
}

/** The fields of one Activity: what an edit changes, and what a typed replacement is made from. */
export function ActivityForm({ name, values, onChange, onSubmit, submitLabel, onCancel, isBusy, problem }: ActivityFormProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form aria-label={name} onSubmit={submit} noValidate>
      {ACTIVITY_FORM_FIELDS.map((field) => (
        <FormField
          key={field}
          label={LABELS[field]}
          type={field === 'durationMinutes' || field === 'estimatedCost' ? 'number' : 'text'}
          value={values[field]}
          onChange={(value) => onChange(field, value)}
          {...(field === 'startTime' ? { description: '24-hour time, for example 14:30.' } : {})}
        />
      ))}
      <button type="submit" disabled={isBusy}>
        {submitLabel}
      </button>
      {onCancel ? (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
      {problem ? <p role="alert">{problem}</p> : null}
    </form>
  );
}
