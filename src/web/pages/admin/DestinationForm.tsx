import { useState, type FormEvent } from 'react';
import { DESTINATION_LIMITS, type DestinationInput } from '../../../shared/destination-schemas';
import type { ApiError } from '../../api-client';
import { FormField } from '../../components/FormField';
import { TextAreaField } from '../../components/TextAreaField';

interface DestinationFormProps {
  /** The form's accessible name, e.g. "Add a Destination". */
  readonly name: string;
  readonly initial: DestinationInput | null;
  readonly submitLabel: string;
  /** Resolves to null on success, or the API's error so the field can be named. */
  readonly onSubmit: (input: DestinationInput) => Promise<ApiError | null>;
}

type FormValues = { readonly [K in keyof DestinationInput]: string };

const EMPTY: FormValues = {
  name: '',
  country: '',
  description: '',
  popularActivities: '',
  recommendedDurationDays: '',
  travelInformation: '',
};

/** Copies the Destination fields by name; a Destination also carries id and isDisabled, which the API refuses. */
const toValues = (input: DestinationInput | null): FormValues =>
  input
    ? {
        name: input.name,
        country: input.country,
        description: input.description,
        popularActivities: input.popularActivities,
        recommendedDurationDays: String(input.recommendedDurationDays),
        travelInformation: input.travelInformation,
      }
    : EMPTY;

const toInput = (values: FormValues): DestinationInput => ({
  ...values,
  recommendedDurationDays: Number.parseInt(values.recommendedDurationDays, 10),
});

export function DestinationForm({ name, initial, submitLabel, onSubmit }: DestinationFormProps) {
  const [values, setValues] = useState<FormValues>(() => toValues(initial));
  const [error, setError] = useState<ApiError | null>(null);

  const change = (field: keyof FormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const failure = await onSubmit(toInput(values));
    setError(failure);
    if (!failure && !initial) setValues(EMPTY);
  };

  return (
    <form aria-label={name} onSubmit={(event) => void submit(event)} noValidate>
      <FormField label="Name" value={values.name} onChange={change('name')} />
      <FormField label="Country" value={values.country} onChange={change('country')} />
      <TextAreaField label="Description" value={values.description} onChange={change('description')} maxLength={DESTINATION_LIMITS.description} />
      <TextAreaField label="Popular activities" value={values.popularActivities} onChange={change('popularActivities')} maxLength={DESTINATION_LIMITS.popularActivities} />
      <FormField
        label="Recommended duration (days)"
        type="number"
        value={values.recommendedDurationDays}
        onChange={change('recommendedDurationDays')}
      />
      <TextAreaField label="Travel information" value={values.travelInformation} onChange={change('travelInformation')} maxLength={DESTINATION_LIMITS.travelInformation} />
      <button type="submit">{submitLabel}</button>
      {error ? <p role="alert">{error.message ?? 'The Destination could not be saved.'}</p> : null}
    </form>
  );
}
