import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api-client';

type Confirmation = { readonly state: 'pending' } | { readonly state: 'confirmed' } | { readonly state: 'refused'; readonly message: string };

export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [confirmation, setConfirmation] = useState<Confirmation>({ state: 'pending' });
  // A confirmation link works once, so it must be sent once even when React re-runs effects.
  const hasSent = useRef(false);

  useEffect(() => {
    if (hasSent.current) return;
    hasSent.current = true;
    void api('POST', '/api/email-confirmations', { token }).then((result) => {
      setConfirmation(
        result.ok
          ? { state: 'confirmed' }
          : { state: 'refused', message: result.error.message ?? 'This link cannot be used.' },
      );
    });
  }, [token]);

  if (confirmation.state === 'pending') {
    return <main><p>Confirming your email address…</p></main>;
  }
  if (confirmation.state === 'refused') {
    return (
      <main>
        <h1>This link cannot be used</h1>
        <p role="alert">{confirmation.message}</p>
      </main>
    );
  }
  return (
    <main>
      <h1>Email address confirmed</h1>
      <Link to="/trips">Go to your Trips</Link>
    </main>
  );
}
