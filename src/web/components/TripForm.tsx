import type { Dispatch, FormEvent } from 'react';
import { CURRENCIES } from '../../shared/currencies';
import { FOOD_PREFERENCES } from '../../shared/food-preferences';
import { TRAVEL_STYLES } from '../../shared/travel-styles';
import { ACCOMMODATION_FIELDS, ACCOMMODATION_LABELS, INTERESTS, TRANSPORTATION } from '../../shared/trip-preferences';
import {
  ACCOMMODATION_FORM_FIELDS,
  type TripFormAction,
  type TripFormListField,
  type TripFormState,
  type TripFormTextField,
} from '../pages/trip-form-state';
import { CheckboxGroup } from './CheckboxGroup';
import { DestinationPicker } from './DestinationPicker';
import { FormField } from './FormField';
import { SelectField } from './SelectField';

/** The client's wording for what the budget covers (ANSWERS.md, "What the budget covers"). */
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
  const change = (field: TripFormTextField) => (value: string) => dispatch({ type: 'changed', field, value });
  const toggle = (field: TripFormListField) => (option: string) => dispatch({ type: 'toggled', field, option });
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
      <CheckboxGroup
        legend="Travel style"
        options={TRAVEL_STYLES}
        chosen={values.travelStyles}
        onToggle={toggle('travelStyles')}
        error={errorFor('travelStyles')}
      />
      <CheckboxGroup
        legend="Interests"
        options={INTERESTS}
        chosen={values.interests}
        onToggle={toggle('interests')}
        error={errorFor('interests')}
      />
      <CheckboxGroup
        legend="Food preference"
        options={FOOD_PREFERENCES}
        chosen={values.foodPreferences}
        onToggle={toggle('foodPreferences')}
        error={errorFor('foodPreferences')}
      />
      <CheckboxGroup
        legend="Transportation"
        options={TRANSPORTATION}
        chosen={values.transportation}
        onToggle={toggle('transportation')}
        error={errorFor('transportation')}
      />
      <fieldset className="choice-group">
        <legend>Accommodation preferences</legend>
        {ACCOMMODATION_FIELDS.map((field) => (
          <FormField
            key={field}
            label={ACCOMMODATION_LABELS[field]}
            value={values[ACCOMMODATION_FORM_FIELDS[field]]}
            onChange={change(ACCOMMODATION_FORM_FIELDS[field])}
          />
        ))}
        {errorFor('accommodation') ? <p className="field-error">{errorFor('accommodation')}</p> : null}
      </fieldset>
      <button type="submit">{submitLabel}</button>
      {outcome.kind === 'saved' ? <p role="status">{outcome.message}</p> : null}
      {outcome.kind === 'failed' ? <p role="alert">{outcome.message}</p> : null}
    </form>
  );
}
