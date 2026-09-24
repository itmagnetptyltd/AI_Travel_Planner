import { useId } from 'react';

interface TextAreaFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly maxLength: number;
}

export function TextAreaField({ label, value, onChange, maxLength }: TextAreaFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} maxLength={maxLength} rows={3} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
