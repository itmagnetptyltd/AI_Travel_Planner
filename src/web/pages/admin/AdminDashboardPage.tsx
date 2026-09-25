import { Link } from 'react-router-dom';
import { ADMIN_FUNCTIONS } from '../../../shared/admin-functions';
import { MetricsPanel } from './MetricsPanel';

/** The admin functions, and nothing else (REQ-TRV-068). */
export function AdminDashboardPage() {
  return (
    <>
      <h1>Admin dashboard</h1>
      <nav aria-label="Admin functions">
        <ul>
          {ADMIN_FUNCTIONS.map((adminFunction) => (
            <li key={adminFunction.key}>
              <Link to={adminFunction.path}>{adminFunction.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <MetricsPanel />
    </>
  );
}
