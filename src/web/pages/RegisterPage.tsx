import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api-client';
import { FormField } from '../components/FormField';
import { PrivacyNotice } from '../components/PrivacyNotice';

interface FieldErrors {
  readonly email?: string;
  readonly password?: string;
  readonly form?: string;
}

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isRegistered, setIsRegistered] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api('POST', '/api/accounts', { email, password });
    if (result.ok) {
      setIsRegistered(true);
      return;
    }
    const message = result.error.message ?? 'Registration failed.';
    if (result.error.code === 'EMAIL_ALREADY_REGISTERED' || result.error.field === 'email') {
      setErrors({ email: result.error.field === 'email' ? 'Enter a valid email address.' : message });
    } else if (result.error.field === 'password') {
      setErrors({ password: message });
    } else {
      setErrors({ form: message });
    }
  };

  if (isRegistered) {
    return (
      <main>
        <h1>Create your account</h1>
        <p role="status">Check your email to confirm your address.</p>
        <Link to="/login">Log in</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Create your account</h1>
      <PrivacyNotice />
      <form onSubmit={(event) => void submit(event)} noValidate>
        <FormField label="Email address" type="email" value={email} onChange={setEmail} error={errors.email} autoComplete="email" />
        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="new-password"
        />
        <p className="hint">At least 12 characters.</p>
        {errors.form ? <p role="alert">{errors.form}</p> : null}
        <button type="submit">Create account</button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
