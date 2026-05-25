import { Routes, Route, Navigate } from "react-router-dom";
import AdminGuard           from "./AdminGuard.jsx";
import AdminLoginScreen     from "./screens/AdminLoginScreen.jsx";
import AdminDashboardScreen from "./screens/AdminDashboardScreen.jsx";
import AdminUsersScreen     from "./screens/AdminUsersScreen.jsx";
import AdminEventsScreen         from "./screens/AdminEventsScreen.jsx";
import AdminEventDetailScreen    from "./screens/AdminEventDetailScreen.jsx";
import AdminTemplatesScreen      from "./screens/AdminTemplatesScreen.jsx";
import AdminSettingsScreen       from "./screens/AdminSettingsScreen.jsx";
import AdminSubscriptionsScreen  from "./screens/AdminSubscriptionsScreen.jsx";
import AdminActivityScreen       from "./screens/AdminActivityScreen.jsx";

// ── AdminApp ──────────────────────────────────────────────────────────────────
//
// Completely separate route tree for /admin/*.
// Never shares state, hooks, or layout with the customer app.
//
// Route map:
//   /admin/login              — public, redirects to dashboard if already authed
//   /admin/dashboard          — protected by AdminGuard
//   /admin/users              — protected
//   /admin/events             — protected
//   /admin/events/:eventId    — protected
//   /admin/templates          — protected
//   /admin/subscriptions      — protected
//   /admin/activity           — protected
//   /admin/settings           — protected
//   /admin/*                  — catch-all redirects to dashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminApp() {
  return (
    <Routes>
      <Route
        path="login"
        element={<AdminLoginScreen />}
      />
      <Route
        path="dashboard"
        element={
          <AdminGuard>
            <AdminDashboardScreen />
          </AdminGuard>
        }
      />
      <Route
        path="users"
        element={
          <AdminGuard>
            <AdminUsersScreen />
          </AdminGuard>
        }
      />
      <Route
        path="events"
        element={
          <AdminGuard>
            <AdminEventsScreen />
          </AdminGuard>
        }
      />
      <Route
        path="events/:eventId"
        element={
          <AdminGuard>
            <AdminEventDetailScreen />
          </AdminGuard>
        }
      />
      <Route
        path="templates"
        element={
          <AdminGuard>
            <AdminTemplatesScreen />
          </AdminGuard>
        }
      />
      <Route
        path="subscriptions"
        element={
          <AdminGuard>
            <AdminSubscriptionsScreen />
          </AdminGuard>
        }
      />
      <Route
        path="activity"
        element={
          <AdminGuard>
            <AdminActivityScreen />
          </AdminGuard>
        }
      />
      <Route
        path="settings"
        element={
          <AdminGuard>
            <AdminSettingsScreen />
          </AdminGuard>
        }
      />
      {/* Catch-all: redirect to dashboard, AdminGuard handles the unauthed case */}
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
}
