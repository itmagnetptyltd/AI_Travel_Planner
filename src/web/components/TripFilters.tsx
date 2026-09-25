import { useId } from 'react';
import { CURRENCIES } from '../../shared/currencies';
import { TRAVEL_STYLES } from '../../shared/travel-styles';
import { hasFilters, type FilterForm, type FilterOptions } from '../pages/trip-list-state';
import { FormField } from './FormField';

interface Choice {
  readonly value: string;
  readonly label: string;
}

function ChoiceField({ label, choices, value, onChange }: {
  readonly label: string;
  readonly choices: readonly Choice[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Any</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const same = (values: readonly string[]): Choice[] => values.map((value) => ({ value, label: value }));

/**
 * The search box and the filters of the Trips page. What is typed in the search waits a moment before it is
 * used, so the list does not change on every key; everything else takes effect at once. Every field is named in
 * words. A combination that cannot be sent is explained by the page, in its one announcement.
 */
export function TripFilters({ form, searchText, options, onSearchText, onChange, onClear }: {
  readonly form: FilterForm;
  readonly searchText: string;
  readonly options: FilterOptions;
  readonly onSearchText: (text: string) => void;
  readonly onChange: (field: keyof FilterForm, value: string) => void;
  readonly onClear: () => void;
}) {
  const set = (field: keyof FilterForm) => (value: string) => onChange(field, value);
  return (
    <form role="search" aria-label="Search and filter Trips" onSubmit={(event) => event.preventDefault()} noValidate>
      <FormField label="Search Trips" value={searchText} onChange={onSearchText} />
      <fieldset className="choice-group">
        <legend>Filters</legend>
        <ChoiceField label="Country" choices={same(options.countries)} value={form.country} onChange={set('country')} />
        <ChoiceField
          label="Destination"
          choices={options.destinations.map((destination) => ({ value: destination.id, label: destination.label }))}
          value={form.destination}
          onChange={set('destination')}
        />
        <ChoiceField label="Travel style" choices={same(TRAVEL_STYLES)} value={form.style} onChange={set('style')} />
        <ChoiceField label="Currency" choices={same(CURRENCIES)} value={form.currency} onChange={set('currency')} />
        <FormField label="Minimum budget" type="number" value={form.minBudget} onChange={set('minBudget')} />
        <FormField label="Maximum budget" type="number" value={form.maxBudget} onChange={set('maxBudget')} />
        <FormField label="Minimum Days" type="number" value={form.minDays} onChange={set('minDays')} />
        <FormField label="Maximum Days" type="number" value={form.maxDays} onChange={set('maxDays')} />
      </fieldset>
      {hasFilters(form) || searchText.trim() !== '' ? (
        <button type="button" onClick={onClear}>
          Clear filters
        </button>
      ) : null}
    </form>
  );
}
