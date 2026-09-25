import { useId, useRef, useState, type ChangeEvent } from 'react';
import { api } from '../api-client';
import type { DestinationSummary } from '../pages/destination';

interface DestinationPickerProps {
  /** "Name, Country" of the chosen Destination, or empty when none is chosen. */
  readonly selectedLabel: string;
  readonly onChoose: (destination: DestinationSummary) => void;
  readonly error?: string | undefined;
}

/**
 * Type-ahead over the enabled Destinations (REQ-TRV-011, REQ-TRV-093). The Traveler can
 * only choose a Destination record; what they type is a search, never the Destination.
 */
export function DestinationPicker({ selectedLabel, onChoose, error }: DestinationPickerProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<readonly DestinationSummary[]>([]);
  const latestSearch = useRef(0);

  const search = async (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setQuery(text);
    const searchNumber = latestSearch.current + 1;
    latestSearch.current = searchNumber;
    const result = await api<{ destinations: DestinationSummary[] }>('GET', `/api/destinations?q=${encodeURIComponent(text)}`);
    // A reply to an older search must not replace the suggestions for the newer one.
    if (searchNumber !== latestSearch.current) return;
    setSuggestions(result.ok ? result.data.destinations : []);
  };

  const choose = (destination: DestinationSummary) => {
    onChoose(destination);
    setQuery('');
    setSuggestions([]);
  };

  return (
    <div className="field">
      <label htmlFor={id}>Destination</label>
      <input
        id={id}
        type="text"
        value={query}
        autoComplete="off"
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => void search(event)}
      />
      {suggestions.length > 0 ? (
        <ul aria-label="Destination suggestions">
          {suggestions.map((destination) => (
            <li key={destination.id}>
              <button type="button" onClick={() => choose(destination)}>
                {`${destination.name}, ${destination.country}`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selectedLabel === '' ? null : <p>{`Selected: ${selectedLabel}`}</p>}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
