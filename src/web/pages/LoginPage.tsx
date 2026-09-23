import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api-client';
import { FormField } from '../components/FormField';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api('POST', '/api/sessions', { email, password });
    if (result.ok) {
      navigate('/trips', { replace: true });
      return;
    }
    setError(result.error.message ?? 'Log in failed.');
  };

  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <FormField label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Log in</button>
      </form>
      <p>
        <Link to="/forgot-password">Forgot your password?</Link>
      </p>
      <p>
        New here? <Link to="/register">Create an account</Link>
      </p>
    </main>
  );
}
