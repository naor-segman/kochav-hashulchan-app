/* Dev-only harness for the admin panel. The panel is behind AdminGuard, which
   needs a real Supabase admin session, so the screens are mounted directly
   here to look at their chrome, heads and empty states. With no .env the
   client is null and every screen shows its "not configured" branch — which is
   exactly the state the design pass needs to cover too. */
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "../src/styles/tokens.css";
import "../src/styles/reset.css";
import AdminDashboardScreen     from "../src/admin/screens/AdminDashboardScreen.jsx";
import AdminUsersScreen         from "../src/admin/screens/AdminUsersScreen.jsx";
import AdminEventsScreen        from "../src/admin/screens/AdminEventsScreen.jsx";
import AdminTemplatesScreen     from "../src/admin/screens/AdminTemplatesScreen.jsx";
import AdminSubscriptionsScreen from "../src/admin/screens/AdminSubscriptionsScreen.jsx";
import AdminActivityScreen      from "../src/admin/screens/AdminActivityScreen.jsx";
import AdminSettingsScreen      from "../src/admin/screens/AdminSettingsScreen.jsx";
import AdminLoginScreen         from "../src/admin/screens/AdminLoginScreen.jsx";

const SCREENS = {
  dashboard:     AdminDashboardScreen,
  users:         AdminUsersScreen,
  events:        AdminEventsScreen,
  templates:     AdminTemplatesScreen,
  subscriptions: AdminSubscriptionsScreen,
  activity:      AdminActivityScreen,
  settings:      AdminSettingsScreen,
  login:         AdminLoginScreen,
};

const which = new URLSearchParams(location.search).get("s") || "dashboard";
const Screen = SCREENS[which] || AdminDashboardScreen;

createRoot(document.getElementById("root")).render(
  <MemoryRouter initialEntries={["/admin/" + which]}>
    <Screen />
  </MemoryRouter>
);
