import type { Dispatch, FormEvent } from 'react';
import { CURRENCIES } from '../../shared/currencies';
import { TRAVEL_STYLES } from '../../shared/travel-styles';
import type { TripFormAction, TripFormField, TripFormState } from '../pages/trip-form-state';
import { DestinationPicker } from './DestinationPicker';
import { FormField } from './FormField';
import { SelectField } from './SelectField';

/** The client's wording for what the budget covers (ANSWERS.md, "What the budget covers"). */
export const BUDGET_NOTE =
  'One total for the whole group, covering costs at the Destination only. It excludes flights or other travel to and from the Destination.';

interface TripFormProps {
  readonly state: TripFormState;
  readonly dispatch: Dispatch<TripFormAction>;
  readonly submitLabel: string;
  readonly onSubmit: () => void;
}

export function TripForm({ state, dispatch, submitLabel, onSubmit }: TripFormProps) {
  const { values, outcome } = state;
  const errorFor = (serverField: string) =>
    outcome.kind === 'failed' && outcome.field === serverField ? outcome.message : undefined;
  const change = (field: TripFormField) => (value: string) => dispatch({ type: 'changed', field, value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={submit} noValidate>
      <FormField label="Trip name" value={values.name} onChange={change('name')} error={errorFor('name')} />
      <DestinationPicker
        selectedLabel={values.destinationLabel}
        error={errorFor('destinationId')}
        onChoose={(destination) => {
          dispatch({ type: 'changed', field: 'destinationId', value: destination.id });
          dispatch({ type: 'changed', field: 'destinationLabel', value: `${destination.name}, ${destination.country}` });
        }}
      />
      <FormField label="Start date" type="date" value={values.startDate} onChange={change('startDate')} error={errorFor('startDate')} />
      <FormField label="End date" type="date" value={values.endDate} onChange={change('endDate')} error={errorFor('endDate')} />
      <FormField label="Adults" type="number" value={values.adults} onChange={change('adults')} error={errorFor('adults')} />
      <FormField label="Children" type="number" value={values.children} onChange={change('children')} error={errorFor('children')} />
      <FormField
        label="Budget"
        type="number"
        value={values.budget}
        onChange={change('budget')}
        error={errorFor('budget')}
        description={BUDGET_NOTE}
      />
      <SelectField
        label="Currency"
        options={CURRENCIES}
        value={values.currency}
        onChange={change('currency')}
        emptyLabel="Choose a currency"
        error={errorFor('currency')}
      />
      <SelectField label="Travel style" options={TRAVEL_STYLES} value={values.travelStyle} onChange={change('travelStyle')} />
      <button type="submit">{submitLabel}</button>
      {outcome.kind === 'saved' ? <p role="status">{outcome.message}</p> : null}
      {outcome.kind === 'failed' ? <p role="alert">{outcome.message}</p> : null}
    </form>
  );
}
