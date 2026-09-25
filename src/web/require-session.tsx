import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { Role } from '../shared/admin-functions';
import { api } from './api-client';

type SessionState =
  | { readonly state: 'checking' }
  | { readonly state: 'logged-out' }
  | { readonly state: 'logged-in'; readonly role: Role };

function useSession(): SessionState {
  const [session, setSession] = useState<SessionState>({ state: 'checking' });

  useEffect(() => {
    let isCurrent = true;
    void api<{ role: Role }>('GET', '/api/sessions/current').then((result) => {
      if (!isCurrent) return;
      setSession(
        result.ok ? { state: 'logged-in', role: result.data.role } : { state: 'logged-out' },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  return session;
}

/** Shows its children only to a logged-in Traveler; anyone else is sent to the login page (REQ-TRV-005). */
export function RequireSession({ children }: { readonly children: ReactNode }) {
  const session = useSession();

  if (session.state === 'checking') {
    return <p>Loading…</p>;
  }
  if (session.state === 'logged-out') {
    return <Navigate to="/login" replace />;
  }
  return <SignedInLayout role={session.role}>{children}</SignedInLayout>;
}

/**
 * Shows its children only to an Administrator. A Traveler is sent back to their Trips (REQ-TRV-068).
 * This hides the screens only; every admin API route refuses non-Administrators on its own.
 */
export function RequireAdministrator({ children }: { readonly children: ReactNode }) {
  const session = useSession();

  if (session.state === 'checking') {
    return <p>Loading…</p>;
  }
  if (session.state === 'logged-out') {
    return <Navigate to="/login" replace />;
  }
  if (session.role !== 'administrator') {
    return <Navigate to="/trips" replace />;
  }
  return <SignedInLayout role={session.role}>{children}</SignedInLayout>;
}

function SignedInLayout({ role, children }: { readonly role: Role; readonly children: ReactNode }) {
  const navigate = useNavigate();
  const logOut = async () => {
    await api('DELETE', '/api/sessions/current');
    navigate('/login', { replace: true });
  };
  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/trips" className="brand">
            <span className="brand-mark" aria-hidden="true">
              AT
            </span>
            AI Travel Planner
          </Link>
          <nav aria-label="Main">
            <Link to="/trips">Trips</Link>
            <Link to="/destinations">Destinations</Link>
            <Link to="/profile">Profile</Link>
            {role === 'administrator' ? <Link to="/admin">Admin</Link> : null}
            <button type="button" onClick={() => void logOut()}>
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}
