import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api-client';
import { FormField } from '../components/FormField';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ readonly text: string; readonly isError: boolean } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<{ message: string }>('POST', '/api/password-resets', { email });
    setMessage(
      result.ok
        ? { text: result.data.message, isError: false }
        : { text: result.error.message ?? 'The reset link could not be sent.', isError: true },
    );
  };

  return (
    <main>
      <h1>Reset your password</h1>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <FormField label="Email address" type="email" value={email} onChange={setEmail} autoComplete="email" />
        <button type="submit">Send reset link</button>
      </form>
      {message ? <p role={message.isError ? 'alert' : 'status'}>{message.text}</p> : null}
      <p>
        <Link to="/login">Back to log in</Link>
      </p>
    </main>
  );
}
