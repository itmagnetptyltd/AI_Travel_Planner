import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from './api-client';

type SessionState = 'checking' | 'logged-in' | 'logged-out';

/** Shows its children only to a logged-in Traveler; anyone else is sent to the login page (REQ-TRV-005). */
export function RequireSession({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<SessionState>('checking');

  useEffect(() => {
    let isCurrent = true;
    void api('GET', '/api/sessions/current').then((result) => {
      if (isCurrent) setState(result.ok ? 'logged-in' : 'logged-out');
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  if (state === 'checking') {
    return <p>Loading…</p>;
  }
  if (state === 'logged-out') {
    return <Navigate to="/login" replace />;
  }
  return <SignedInLayout>{children}</SignedInLayout>;
}

function SignedInLayout({ children }: { readonly children: ReactNode }) {
  const navigate = useNavigate();
  const logOut = async () => {
    await api('DELETE', '/api/sessions/current');
    navigate('/login', { replace: true });
  };
  return (
    <>
      <nav aria-label="Main">
        <Link to="/trips">Trips</Link>
        <Link to="/profile">Profile</Link>
        <button type="button" onClick={() => void logOut()}>
          Log out
        </button>
      </nav>
      <main>{children}</main>
    </>
  );
}
