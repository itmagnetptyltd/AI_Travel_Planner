import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api-client';
import { FormField } from '../components/FormField';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isChanged, setIsChanged] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api('POST', '/api/password-resets/complete', { token, newPassword });
    if (result.ok) {
      setIsChanged(true);
      return;
    }
    setError(result.error.message ?? 'The password could not be changed.');
  };

  if (isChanged) {
    return (
      <main>
        <h1>Choose a new password</h1>
        <p role="status">Your password has been changed.</p>
        <Link to="/login">Log in</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Choose a new password</h1>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <FormField
          label="New password"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          error={error}
          autoComplete="new-password"
        />
        <p className="hint">At least 12 characters.</p>
        <button type="submit">Set new password</button>
      </form>
    </main>
  );
}
