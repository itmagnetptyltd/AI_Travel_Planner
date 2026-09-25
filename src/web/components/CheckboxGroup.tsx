import { useId } from 'react';

interface CheckboxGroupProps {
  readonly legend: string;
  readonly options: readonly string[];
  readonly chosen: readonly string[];
  readonly onToggle: (option: string) => void;
  readonly error?: string | undefined;
}

/** A choice of several from a fixed list: a labelled group with one checkbox per option. */
export function CheckboxGroup({ legend, options, chosen, onToggle, error }: CheckboxGroupProps) {
  const errorId = useId();
  return (
    <fieldset className="choice-group" aria-describedby={error ? errorId : undefined}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label key={option} className="choice">
          <input type="checkbox" checked={chosen.includes(option)} onChange={() => onToggle(option)} />
          {option}
        </label>
      ))}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
