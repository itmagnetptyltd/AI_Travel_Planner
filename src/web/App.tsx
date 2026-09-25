import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdministrator, RequireSession } from './require-session';
import { AdminAiRequestPage } from './pages/admin/AdminAiRequestPage';
import { AdminAiRequestsPage } from './pages/admin/AdminAiRequestsPage';
import { AdminAiUsageLimitsPage } from './pages/admin/AdminAiUsageLimitsPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminDestinationsPage } from './pages/admin/AdminDestinationsPage';
import { AdminUserPage } from './pages/admin/AdminUserPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { DestinationDetailPage } from './pages/DestinationDetailPage';
import { DestinationsPage } from './pages/DestinationsPage';
import { ConfirmEmailPage } from './pages/ConfirmEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TripFormPage } from './pages/TripFormPage';
import { TripPage } from './pages/TripPage';
import { TripsPage } from './pages/TripsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/trips" replace />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/confirm-email" element={<ConfirmEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/trips" element={<RequireSession><TripsPage /></RequireSession>} />
        <Route path="/trips/new" element={<RequireSession><TripFormPage /></RequireSession>} />
        <Route path="/trips/:id" element={<RequireSession><TripPage /></RequireSession>} />
        <Route path="/trips/:id/edit" element={<RequireSession><TripFormPage /></RequireSession>} />
        <Route path="/profile" element={<RequireSession><ProfilePage /></RequireSession>} />
        <Route path="/destinations" element={<RequireSession><DestinationsPage /></RequireSession>} />
        <Route path="/destinations/:id" element={<RequireSession><DestinationDetailPage /></RequireSession>} />
        <Route path="/admin" element={<RequireAdministrator><AdminDashboardPage /></RequireAdministrator>} />
        <Route path="/admin/users" element={<RequireAdministrator><AdminUsersPage /></RequireAdministrator>} />
        <Route path="/admin/users/:id" element={<RequireAdministrator><AdminUserPage /></RequireAdministrator>} />
        <Route path="/admin/destinations" element={<RequireAdministrator><AdminDestinationsPage /></RequireAdministrator>} />
        <Route path="/admin/ai-usage-limits" element={<RequireAdministrator><AdminAiUsageLimitsPage /></RequireAdministrator>} />
        <Route path="/admin/ai-requests" element={<RequireAdministrator><AdminAiRequestsPage /></RequireAdministrator>} />
        <Route path="/admin/ai-requests/:id" element={<RequireAdministrator><AdminAiRequestPage /></RequireAdministrator>} />
        <Route path="*" element={<Navigate to="/trips" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
