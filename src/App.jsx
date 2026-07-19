import { useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  Routes, Route, Navigate,
  useNavigate, useParams, useLocation,
} from "react-router-dom";
import { uid } from "./utils/uid.js";
import { duplicateEvent } from "./utils/eventHelpers.js";
import { useAuth }          from "./hooks/useAuth.js";
import { useEvents }        from "./hooks/useEvents.js";
import { useToast }         from "./hooks/useToast.js";
import { usePlan }          from "./hooks/usePlan.js";
import { useActiveEvent }   from "./hooks/useActiveEvent.js";
import { useMigration, MIGRATION_STATUS } from "./hooks/useMigration.js";
import { SYNC_STATUS } from "./utils/cloudSync.js";
import { canCreateEvent } from "./utils/featureGates.js";
import Shell              from "./components/layout/Shell.jsx";
import Toast              from "./components/feedback/Toast.jsx";
import MigrationBanner    from "./components/migration/MigrationBanner.jsx";
import DashboardScreen    from "./screens/DashboardScreen.jsx";
import EventSetupScreen   from "./screens/EventSetupScreen.jsx";
import TableBuilderScreen from "./screens/TableBuilderScreen.jsx";
import GuestManagerScreen from "./screens/GuestManagerScreen.jsx";
import ConstraintsScreen  from "./screens/ConstraintsScreen.jsx";
import SeatingScreen      from "./screens/SeatingScreen.jsx";
import LoginScreen        from "./screens/LoginScreen.jsx";
import SignupScreen       from "./screens/SignupScreen.jsx";
import AccountScreen      from "./screens/AccountScreen.jsx";
import NotFoundScreen     from "./screens/NotFoundScreen.jsx";
import AuthCallbackScreen from "./screens/AuthCallbackScreen.jsx";
import CheckInScreen      from "./screens/CheckInScreen.jsx";
import LandingScreen      from "./screens/LandingScreen.jsx";
// Lazy-load the entire admin subtree — Supabase and admin screens never
// appear in the customer-facing initial bundle.
const AdminApp       = lazy(() => import("./admin/AdminApp.jsx"));
const PricingScreen  = lazy(() => import("./screens/PricingScreen.jsx"));
// Public pages — standalone, no auth, token-based
const RSVPScreen     = lazy(() => import("./screens/RSVPScreen.jsx"));
const InviteScreen   = lazy(() => import("./screens/InviteScreen.jsx"));
const HostessScreen  = lazy(() => import("./screens/HostessScreen.jsx"));
const GiftScreen     = lazy(() => import("./screens/GiftScreen.jsx"));
const GiftWallScreen = lazy(() => import("./screens/GiftWallScreen.jsx"));
// App screens — lazy to keep initial bundle lean
const CostScreen     = lazy(() => import("./screens/CostScreen.jsx"));

// ── Event layout + nested routes ─────────────────────────────────────────────
// Rendered for every /events/:eventId/* path.
// Reads eventId from the URL, validates it, provides patchEvent/go/showToast
// to child screens using the same prop API they already use.

function EventRoutes({ events, patchEventById, showToast, toast, syncStatus }) {
  const { eventId } = useParams();
  const navigate    = useNavigate();
  const location    = useLocation();
  const activeEvent = useActiveEvent(events, eventId);

  // All hooks must be called before any conditional return (Rules of Hooks).
  const patchEvent = useCallback(
    (patch) => patchEventById(eventId, patch),
    [eventId, patchEventById],
  );

  const go = useCallback((screen, newEventId) => {
    window.scrollTo(0, 0);
    if (screen === "dashboard") navigate("/app");
    else navigate(`/events/${newEventId || eventId}/${screen}`);
  }, [navigate, eventId]);

  // Unknown event ID → wait for cloud sync before bouncing to dashboard.
  // Without this guard, a bookmarked URL on a fresh device would immediately
  // redirect before cloud events have loaded.
  if (!activeEvent) {
    if (syncStatus === SYNC_STATUS.SYNCING) return <div aria-busy="true" />;
    return <Navigate to="/app" replace />;
  }

  // Derive active tab name from last URL segment ("setup", "tables", …)
  const segments = location.pathname.split("/");
  const screen   = segments[segments.length - 1];

  const sp = { activeEvent, patchEvent, go, showToast };

  return (
    <Shell screen={screen} activeEvent={activeEvent} go={go} syncStatus={syncStatus} showToast={showToast}>
      <Routes>
        <Route path="setup"       element={<EventSetupScreen   {...sp} />} />
        <Route path="tables"      element={<TableBuilderScreen  {...sp} />} />
        <Route path="guests"      element={<GuestManagerScreen  {...sp} />} />
        <Route path="constraints" element={<ConstraintsScreen   {...sp} />} />
        <Route path="seating"     element={<SeatingScreen       {...sp} />} />
        <Route path="costs"       element={<Suspense fallback={null}><CostScreen activeEvent={activeEvent} patchEvent={patchEvent} go={go} showToast={showToast} /></Suspense>} />
        <Route index              element={<Navigate to="setup" replace />} />
      </Routes>
      {toast && <Toast msg={toast.msg} variant={toast.variant} />}
    </Shell>
  );
}

// ── Root app ──────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading: authLoading }                                  = useAuth();
  const { events, addEvent, removeEvent, patchEventById, syncStatus }  = useEvents(user);
  const { toast, showToast }                                            = useToast();
  const { plan }                                                        = usePlan();
  const navigate                                                        = useNavigate();
  const migration = useMigration(events, patchEventById, user);

  // PWA update — auto-apply the new service worker and notify the user
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    onRegistered() {},
    onRegisterError() {},
  });
  useEffect(() => {
    if (needRefresh[0]) {
      updateServiceWorker(true);
      showToast("האפליקציה עודכנה לגרסה החדשה ✓");
    }
  }, [needRefresh, updateServiceWorker, showToast]);

  // Show a one-time toast whenever a cloud sync error occurs.
  const prevSyncRef = useRef(null);
  useEffect(() => {
    if (syncStatus === SYNC_STATUS.ERROR && prevSyncRef.current !== SYNC_STATUS.ERROR) {
      showToast("סנכרון ענן נכשל — הנתונים שמורים מקומית", "err");
    }
    prevSyncRef.current = syncStatus;
  }, [syncStatus, showToast]);

  // Warn when localStorage quota is exceeded (data not persisted).
  useEffect(() => {
    const handler = () => showToast("⚠ הנפח המקומי מלא — הנתונים לא נשמרו! ייצא לאקסל כעת.", "err");
    window.addEventListener("storage-quota-exceeded", handler);
    return () => window.removeEventListener("storage-quota-exceeded", handler);
  }, [showToast]);

  const createEvent = useCallback((template) => {
    const gate = canCreateEvent(plan, events.length);
    if (!gate.allowed) {
      showToast(gate.reason + " — שדרג את התוכנית להוספת אירועים נוספים", "err");
      return;
    }
    const now = Date.now();
    const ev = {
      id: uid(), name: "", type: template?.type || "חתונה", date: "", venue: "",
      brideName: "", groomName: "",
      tables: [], guests: [], seating: {}, constraints: [],
      createdAt: now,
      updatedAt:  now,
      version:    1,
    };
    addEvent(ev);
    navigate(`/events/${ev.id}/setup`);
    window.scrollTo(0, 0);
  }, [addEvent, navigate, plan, events.length, showToast]);

  const deleteEvent = useCallback((id) => {
    removeEvent(id);
    showToast("האירוע נמחק לצמיתות");
  }, [removeEvent, showToast]);

  const handleDuplicateEvent = useCallback((id) => {
    const gate = canCreateEvent(plan, events.length);
    if (!gate.allowed) {
      showToast(gate.reason + " — שדרג את התוכנית להוספת אירועים נוספים", "err");
      return;
    }
    const original = events.find(e => e.id === id);
    if (!original) return;
    const copy = duplicateEvent(original);
    addEvent(copy);
    navigate(`/events/${copy.id}/setup`);
    window.scrollTo(0, 0);
    showToast("האירוע שוכפל ✓");
  }, [events, addEvent, navigate, plan, showToast]);

  // go() for the dashboard Shell — subnav is hidden on dashboard so only
  // the logo click (→ "/") needs to be handled here.
  const dashGo = useCallback((screen, id) => {
    window.scrollTo(0, 0);
    if (screen === "dashboard") navigate("/app");
    else if (id) navigate(`/events/${id}/${screen}`);
  }, [navigate]);

  return (
    <Routes>
      {/* Landing page — unauthenticated visitors */}
      <Route
        path="/"
        element={authLoading ? <div /> : user ? <Navigate to="/app" replace /> : <LandingScreen />}
      />
      {/* Dashboard — authenticated app */}
      <Route
        path="/app"
        element={
          <Shell screen="dashboard" activeEvent={null} go={dashGo}>
            {(migration.shouldPrompt || migration.status !== MIGRATION_STATUS.IDLE) && (
              <MigrationBanner migration={migration} />
            )}
            <DashboardScreen
              events={events}
              plan={plan}
              onCreateEvent={createEvent}
              onOpenEvent={id => { navigate(`/events/${id}/setup`); window.scrollTo(0, 0); }}
              onDeleteEvent={deleteEvent}
              onDuplicateEvent={handleDuplicateEvent}
            />
            {toast && <Toast msg={toast.msg} variant={toast.variant} />}
          </Shell>
        }
      />
      {/* Pricing page */}
      <Route
        path="/pricing"
        element={
          <Suspense fallback={null}>
            <PricingScreen user={user} />
          </Suspense>
        }
      />
      {/* ── Public token-based pages — no auth required ── */}
      {/* /gift/:token/wall MUST precede /gift/:token — React Router first-match */}
      <Route path="/gift/:token/wall" element={<Suspense fallback={null}><GiftWallScreen /></Suspense>} />
      <Route path="/gift/:token"      element={<Suspense fallback={null}><GiftScreen /></Suspense>} />
      <Route path="/rsvp/:token"      element={<Suspense fallback={null}><RSVPScreen /></Suspense>} />
      <Route path="/invite/:token"    element={<Suspense fallback={null}><InviteScreen /></Suspense>} />
      <Route path="/hostess/:token"   element={<Suspense fallback={null}><HostessScreen /></Suspense>} />
      {/* Standalone check-in screen — no Shell nav, full-screen for event-day tablet use */}
      <Route
        path="/events/:eventId/checkin"
        element={<CheckInScreen events={events} patchEventById={patchEventById} showToast={showToast} />}
      />
      <Route
        path="/events/:eventId/*"
        element={
          <EventRoutes
            events={events}
            patchEventById={patchEventById}
            showToast={showToast}
            toast={toast}
            syncStatus={syncStatus}
          />
        }
      />
      {/* ── Customer auth routes — standalone full-page screens ── */}
      <Route path="/login"         element={<LoginScreen />} />
      <Route path="/signup"        element={<SignupScreen />} />
      <Route path="/account"       element={<AccountScreen eventCount={events.length} />} />
      <Route path="/auth/callback" element={<AuthCallbackScreen />} />

      {/* ── Admin area — lazy-loaded, completely isolated from customer app ── */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={null}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}
