import { Link } from 'react-router-dom';
import { ADMIN_FUNCTIONS } from '../../../shared/admin-functions';

/** The admin functions, and nothing else (REQ-TRV-068). Three are built in later slices. */
export function AdminDashboardPage() {
  return (
    <>
      <h1>Admin dashboard</h1>
      <nav aria-label="Admin functions">
        <ul>
          {ADMIN_FUNCTIONS.map((adminFunction) => (
            <li key={adminFunction.key}>
              {adminFunction.path === null ? (
                <>
                  {adminFunction.label} <span className="muted">(Not available yet)</span>
                </>
              ) : (
                <Link to={adminFunction.path}>{adminFunction.label}</Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
