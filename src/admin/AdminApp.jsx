import { Routes, Route, Navigate } from "react-router-dom";
import AdminGuard           from "./AdminGuard.jsx";
import AdminLoginScreen     from "./screens/AdminLoginScreen.jsx";
import AdminDashboardScreen from "./screens/AdminDashboardScreen.jsx";
import AdminUsersScreen     from "./screens/AdminUsersScreen.jsx";
import AdminEventsScreen         from "./screens/AdminEventsScreen.jsx";
import AdminEventDetailScreen    from "./screens/AdminEventDetailScreen.jsx";
import AdminTemplatesScreen      from "./screens/AdminTemplatesScreen.jsx";
import AdminSettingsScreen       from "./screens/AdminSettingsScreen.jsx";

// ── AdminApp ──────────────────────────────────────────────────────────────────
//
// Completely separate route tree for /admin/*.
// Never shares state, hooks, or layout with the customer app.
//
// Route map:
//   /admin/login      — public, redirects to dashboard if already authed
//   /admin/dashboard  — protected by AdminGuard
//   /admin/*          — catch-all redirects to dashboard (guard handles unauthed)
//
// TODO(admin-phase2): add /admin/users, /admin/events routes here.
// TODO(admin-phase3): add /admin/templates, /admin/subscriptions routes here.
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
        path="settings"
        element={
          <AdminGuard>
            <AdminSettingsScreen />
          </AdminGuard>
        }
      />
      {/* Catch-all: redirect to dashboard, AdminGuard handles the unauthed case */}
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
