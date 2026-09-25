import { useId, type ChangeEvent } from 'react';

interface FormFieldProps {
  readonly label: string;
  readonly type?: 'text' | 'email' | 'password' | 'number' | 'date';
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  /** Text shown beside the field and read out with it. */
  readonly description?: string;
  readonly autoComplete?: string;
}

export function FormField({ label, type = 'text', value, onChange, error, description, autoComplete }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {description ? (
        <p id={descriptionId} className="hint">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
