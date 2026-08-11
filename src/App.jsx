import { useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  Routes, Route, Navigate,
  useNavigate, useParams, useLocation,
} from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { uid } from "./utils/uid.js";
import { duplicateEvent } from "./utils/eventHelpers.js";
import { AuthProvider, useAuth } from "./hooks/useAuth.js";
import { useEvents }        from "./hooks/useEvents.js";
import { useToast }         from "./hooks/useToast.js";
import { usePlan }          from "./hooks/usePlan.js";
import { useActiveEvent }   from "./hooks/useActiveEvent.js";
import { useCollabSync }    from "./hooks/useCollabSync.js";
import { useMigration, MIGRATION_STATUS } from "./hooks/useMigration.js";
import { SYNC_STATUS } from "./utils/cloudSync.js";
import { canCreateEvent } from "./utils/featureGates.js";
import Shell              from "./components/layout/Shell.jsx";
import Toast              from "./components/feedback/Toast.jsx";
import MigrationBanner    from "./components/migration/MigrationBanner.jsx";
import DashboardScreen    from "./screens/DashboardScreen.jsx";
import EventHubScreen     from "./screens/EventHubScreen.jsx";
import StartScreen        from "./screens/StartScreen.jsx";
import EventSetupScreen   from "./screens/EventSetupScreen.jsx";
import LoginScreen        from "./screens/LoginScreen.jsx";
import SignupScreen       from "./screens/SignupScreen.jsx";
import ResetPasswordScreen from "./screens/ResetPasswordScreen.jsx";
import AccountScreen      from "./screens/AccountScreen.jsx";
import NotFoundScreen     from "./screens/NotFoundScreen.jsx";
import Loading           from "./components/feedback/Loading.jsx";
import AuthCallbackScreen from "./screens/AuthCallbackScreen.jsx";
// Lazy-load the entire admin subtree — Supabase and admin screens never
// appear in the customer-facing initial bundle.
// Heavy authenticated screens. SeatingScreen alone drags in @dnd-kit, and a
// first-time visitor on the marketing page has no use for any of them — keeping
// them eager meant downloading the whole app before signup.
const TableBuilderScreen = lazy(() => import("./screens/TableBuilderScreen.jsx"));
const GuestManagerScreen = lazy(() => import("./screens/GuestManagerScreen.jsx"));
const ConstraintsScreen  = lazy(() => import("./screens/ConstraintsScreen.jsx"));
const SeatingScreen      = lazy(() => import("./screens/SeatingScreen.jsx"));
const CheckInScreen      = lazy(() => import("./screens/CheckInScreen.jsx"));
// The unified day-of screen. CheckInScreen / HostessScreen are now thin shims
// over it and stay routed for links already printed on invitations.
const EntranceScreen     = lazy(() => import("./screens/EntranceScreen.jsx"));
const LandingScreen      = lazy(() => import("./screens/LandingScreen.jsx"));

const AdminApp       = lazy(() => import("./admin/AdminApp.jsx"));
const PricingScreen  = lazy(() => import("./screens/PricingScreen.jsx"));
// Public pages — standalone, no auth, token-based
const RSVPScreen     = lazy(() => import("./screens/RSVPScreen.jsx"));
const EventSiteScreen = lazy(() => import("./screens/EventSiteScreen.jsx"));
const HostessScreen  = lazy(() => import("./screens/HostessScreen.jsx"));
const CollabScreen   = lazy(() => import("./screens/CollabScreen.jsx"));
const InviteScreen   = lazy(() => import("./screens/InviteScreen.jsx"));
const GiftScreen     = lazy(() => import("./screens/GiftScreen.jsx"));
const GiftWallScreen = lazy(() => import("./screens/GiftWallScreen.jsx"));
// App screens — lazy to keep initial bundle lean
const CostScreen          = lazy(() => import("./screens/CostScreen.jsx"));
const TasksScreen         = lazy(() => import("./screens/TasksScreen.jsx"));
const AnnouncementsEditorScreen = lazy(() => import("./screens/AnnouncementsEditorScreen.jsx"));
const VendorsScreen             = lazy(() => import("./screens/VendorsScreen.jsx"));
const MessagesScreen            = lazy(() => import("./screens/MessagesScreen.jsx"));
const NameTagsScreen            = lazy(() => import("./screens/NameTagsScreen.jsx"));
const AlbumScreen               = lazy(() => import("./screens/AlbumScreen.jsx"));
const AnnouncementScreen        = lazy(() => import("./screens/AnnouncementScreen.jsx"));
const RSVPResponsesScreen = lazy(() => import("./screens/RSVPResponsesScreen.jsx"));
const CollabReviewScreen  = lazy(() => import("./screens/CollabReviewScreen.jsx"));
const EventSiteEditorScreen = lazy(() => import("./screens/EventSiteEditorScreen.jsx"));
// Legal / policy pages — lazy, rarely visited
const HelpScreen          = lazy(() => import("./screens/HelpScreen.jsx"));
const PrivacyScreen       = lazy(() => import("./screens/PrivacyScreen.jsx"));
const TermsScreen         = lazy(() => import("./screens/TermsScreen.jsx"));
const AccessibilityScreen = lazy(() => import("./screens/AccessibilityScreen.jsx"));

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

  // "hub" (or an empty screen) is the event's own front page at /events/:id.
  // Everything else keeps the shape it already had, so no screen had to change
  // the way it calls go().
  const go = useCallback((screen, newEventId) => {
    window.scrollTo(0, 0);
    const id = newEventId || eventId;
    if (screen === "dashboard") navigate("/app");
    else if (!screen || screen === "hub") navigate(`/events/${id}`);
    else navigate(`/events/${id}/${screen}`);
  }, [navigate, eventId]);

  // Keep the shared collaborative table and this event's guest list in sync,
  // both ways, while the event is open. No-op unless collab is enabled + synced.
  useCollabSync(activeEvent, patchEvent, showToast);

  // Unknown event ID → wait for cloud sync before bouncing to dashboard.
  // Without this guard, a bookmarked URL on a fresh device would immediately
  // redirect before cloud events have loaded.
  if (!activeEvent) {
    // A bookmarked event URL on a fresh device waits here for the cloud pull.
    // That was a blank white page for as long as the fetch took — on venue wifi,
    // seconds — with nothing to say the app was working.
    if (syncStatus === SYNC_STATUS.SYNCING) return <Loading label="טוענים את האירוע…" />;
    return <Navigate to="/app" replace />;
  }

  // Derive the active screen from the path RELATIVE to this event, not from the
  // last segment: `/events/:id` (the hub) has no trailing segment of its own,
  // and taking the last one made the screen name the event id.
  const rest   = location.pathname.replace(`/events/${eventId}`, "").replace(/^\/+/, "");
  const screen = rest === "" ? "hub" : rest.split("/")[0];

  const sp = { activeEvent, patchEvent, go, showToast };

  return (
    <Shell screen={screen} activeEvent={activeEvent} go={go} syncStatus={syncStatus} showToast={showToast}>
      {/* Screen-level boundary. The root one in main.jsx swallows the WHOLE app
          — nav, event, everything — when a single lazy chunk fails to load,
          which is exactly what happens to an open tab after a deploy. Keyed on
          the path so navigating away is itself the recovery. */}
      <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="setup"       element={<EventSetupScreen   {...sp} />} />
        <Route path="tables"      element={<Suspense fallback={<Loading />}><TableBuilderScreen {...sp} /></Suspense>} />
        <Route path="guests"      element={<Suspense fallback={<Loading />}><GuestManagerScreen {...sp} /></Suspense>} />
        <Route path="constraints" element={<Suspense fallback={<Loading />}><ConstraintsScreen {...sp} /></Suspense>} />
        <Route path="seating"     element={<Suspense fallback={<Loading />}><SeatingScreen {...sp} /></Suspense>} />
        <Route path="site"        element={<Suspense fallback={<Loading />}><EventSiteEditorScreen {...sp} /></Suspense>} />
        <Route path="rsvps"       element={<Suspense fallback={<Loading />}><RSVPResponsesScreen {...sp} /></Suspense>} />
        <Route path="collab"      element={<Suspense fallback={<Loading />}><CollabReviewScreen {...sp} /></Suspense>} />
        <Route path="costs"       element={<Suspense fallback={<Loading />}><CostScreen key={activeEvent.id} activeEvent={activeEvent} patchEvent={patchEvent} go={go} showToast={showToast} /></Suspense>} />
        <Route path="tasks"       element={<Suspense fallback={<Loading />}><TasksScreen activeEvent={activeEvent} patchEvent={patchEvent} showToast={showToast} /></Suspense>} />
        <Route path="announce"    element={<Suspense fallback={<Loading />}><AnnouncementsEditorScreen activeEvent={activeEvent} patchEvent={patchEvent} showToast={showToast} /></Suspense>} />
        <Route path="vendors"     element={<Suspense fallback={<Loading />}><VendorsScreen activeEvent={activeEvent} patchEvent={patchEvent} showToast={showToast} /></Suspense>} />
        <Route path="messages"    element={<Suspense fallback={<Loading />}><MessagesScreen activeEvent={activeEvent} patchEvent={patchEvent} showToast={showToast} /></Suspense>} />
        <Route path="nametags"    element={<Suspense fallback={<Loading />}><NameTagsScreen activeEvent={activeEvent} /></Suspense>} />
        {/* The event's front page. This used to redirect to `setup`, which is
            why opening an event dropped a first-time host straight into a form
            with no idea what the other thirteen screens were for. */}
        <Route index              element={<EventHubScreen {...sp} />} />
        {/* Without this, /events/:id/typo matched `/events/:eventId/*` at the
            top level and then matched nothing here — the Shell rendered with a
            blank body and no error. The top-level catch-all cannot reach it. */}
        <Route path="*"           element={<NotFoundScreen />} />
      </Routes>
      </ErrorBoundary>
      {toast && <Toast msg={toast.msg} variant={toast.variant} />}
    </Shell>
  );
}

// Host-only preview of the event site, rendered from local (owned) event data.
function EventSitePreview({ events }) {
  const { eventId } = useParams();
  const ev = events.find(e => e.id === eventId);
  if (!ev) return <Navigate to="/app" replace />;
  return <Suspense fallback={<Loading />}><EventSiteScreen localEvent={ev} /></Suspense>;
}

// Host-only draft preview of a Save-the-Date / invitation. Renders from local
// data so the host sees the page before publishing — and before the event has
// ever been synced to the cloud, where the public route would find nothing.
function AnnouncementPreview({ events }) {
  const { eventId, kind } = useParams();
  const ev = events.find(e => e.id === eventId);
  if (!ev) return <Navigate to="/app" replace />;
  const safeKind = kind === "saveTheDate" ? "saveTheDate" : "invitation";
  return <Suspense fallback={<Loading />}><AnnouncementScreen kind={safeKind} localEvent={ev} /></Suspense>;
}

// ── Root app ──────────────────────────────────────────────────────────────────

// The provider has to sit ABOVE every useAuth() consumer, and App itself is one
// of them — hence the split. main.jsx is untouched.
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function AppRoutes() {
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
    const handler = () => showToast("הנפח המקומי מלא — הנתונים לא נשמרו! ייצאו לאקסל כעת.", "err");
    window.addEventListener("storage-quota-exceeded", handler);
    return () => window.removeEventListener("storage-quota-exceeded", handler);
  }, [showToast]);

  // Creation now carries the two facts the start screen collected, so the event
  // arrives already named and dated instead of arriving empty and demanding a
  // form. `seed` fields are whitelisted below rather than spread, so a future
  // field on the start screen cannot silently write an unknown key into an
  // event record that has to survive the cloud round-trip.
  const startEvent = useCallback((seed = {}) => {
    const gate = canCreateEvent(plan, events.length);
    if (!gate.allowed) {
      showToast(gate.reason + " — שדרגו את התוכנית להוספת אירועים נוספים", "err");
      return;
    }
    const now = Date.now();
    const ev = {
      id: uid(),
      name:  seed.name || "",
      type:  seed.type || "חתונה",
      date:  seed.date || "",
      venue: "",
      brideName:        seed.brideName        || "",
      groomName:        seed.groomName        || "",
      celebrantName:    seed.celebrantName    || "",
      organizationName: seed.organizationName || "",
      ownerName:        seed.ownerName        || "",
      tables: [], guests: [], seating: {}, constraints: [],
      createdAt: now,
      updatedAt:  now,
      version:    1,
    };
    addEvent(ev);
    navigate(`/events/${ev.id}`);
    window.scrollTo(0, 0);
  }, [addEvent, navigate, plan, events.length, showToast]);

  const deleteEvent = useCallback((id) => {
    removeEvent(id);
    showToast("האירוע נמחק לצמיתות");
  }, [removeEvent, showToast]);

  const handleDuplicateEvent = useCallback((id) => {
    const gate = canCreateEvent(plan, events.length);
    if (!gate.allowed) {
      showToast(gate.reason + " — שדרגו את התוכנית להוספת אירועים נוספים", "err");
      return;
    }
    const original = events.find(e => e.id === id);
    if (!original) return;
    const copy = duplicateEvent(original);
    addEvent(copy);
    navigate(`/events/${copy.id}`);
    window.scrollTo(0, 0);
    showToast("האירוע שוכפל ✓");
  }, [events, addEvent, navigate, plan, showToast]);

  // go() for the dashboard Shell — the area rails are hidden on the dashboard,
  // so only the wordmark click and "new event" reach this.
  const dashGo = useCallback((screen, id) => {
    window.scrollTo(0, 0);
    if (screen === "dashboard") navigate("/app");
    else if (screen === "start") navigate("/start");
    else if (id) navigate(`/events/${id}/${screen}`);
  }, [navigate]);

  return (
    <Routes>
      {/* Landing page — unauthenticated visitors */}
      <Route
        path="/"
        element={authLoading ? <div /> : user ? <Navigate to="/app" replace /> : <Suspense fallback={<Loading />}><LandingScreen /></Suspense>}
      />
      {/* The marketing site, reachable while logged in.
          "/" bounces an authenticated visitor into the app — which is right —
          but it also meant there was no way back out to the public page at all,
          short of logging out. The topbar's "עמוד הבית" points here. */}
      <Route
        path="/home"
        element={<Suspense fallback={<Loading />}><LandingScreen /></Suspense>}
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
              onStartEvent={startEvent}
              onNewEvent={() => { navigate("/start"); window.scrollTo(0, 0); }}
              onOpenEvent={id => { navigate(`/events/${id}`); window.scrollTo(0, 0); }}
              onDeleteEvent={deleteEvent}
              onDuplicateEvent={handleDuplicateEvent}
            />
            {toast && <Toast msg={toast.msg} variant={toast.variant} />}
          </Shell>
        }
      />
      {/* The opening screen — what the product does, and the two facts that are
          true on day one. Its own route so it can be reached again from the
          dashboard, and so the first-run path has an address. */}
      <Route
        path="/start"
        element={
          <Shell screen="dashboard" activeEvent={null} go={dashGo}>
            <StartScreen
              onStart={startEvent}
              hasEvents={events.length > 0}
              onCancel={() => navigate("/app")}
            />
            {toast && <Toast msg={toast.msg} variant={toast.variant} />}
          </Shell>
        }
      />
      {/* Pricing page */}
      <Route
        path="/pricing"
        element={
          <Suspense fallback={<Loading />}>
            <PricingScreen user={user} />
          </Suspense>
        }
      />
      {/* ── Public token-based pages — no auth required ── */}
      {/* /gift/:token/wall MUST precede /gift/:token — React Router first-match */}
      <Route path="/gift/:token/wall" element={<Suspense fallback={<Loading />}><GiftWallScreen /></Suspense>} />
      <Route path="/gift/:token"      element={<Suspense fallback={<Loading />}><GiftScreen /></Suspense>} />
      <Route path="/rsvp/:token"      element={<Suspense fallback={<Loading />}><RSVPScreen /></Suspense>} />
      <Route path="/invite/:token"    element={<Suspense fallback={<Loading />}><EventSiteScreen /></Suspense>} />
      <Route path="/card/:token"      element={<Suspense fallback={<Loading />}><InviteScreen /></Suspense>} />
      <Route path="/album/:token"     element={<Suspense fallback={<Loading />}><AlbumScreen /></Suspense>} />
      <Route path="/save-the-date/:token" element={<Suspense fallback={<Loading />}><AnnouncementScreen kind="saveTheDate" /></Suspense>} />
      <Route path="/invitation/:token"    element={<Suspense fallback={<Loading />}><AnnouncementScreen kind="invitation" /></Suspense>} />
      <Route path="/hostess/:token"   element={<Suspense fallback={<Loading />}><HostessScreen /></Suspense>} />
      <Route path="/collab/:token"    element={<Suspense fallback={<Loading />}><CollabScreen /></Suspense>} />
      {/* ── עמדת הכניסה — the one day-of screen ──────────────────────────
          Two ways in, one screen: the host's own device (owner) and a hired
          greeter's phone with no account (token). `/checkin` and `/hostess`
          stay routed as aliases — they are printed on QR codes that are already
          out in the world — and both now render the same thing. */}
      <Route
        path="/events/:eventId/entrance"
        element={<Suspense fallback={<Loading />}><EntranceScreen mode="owner" events={events} patchEventById={patchEventById} loading={authLoading || syncStatus === SYNC_STATUS.SYNCING} /></Suspense>}
      />
      <Route
        path="/entrance/:token"
        element={<Suspense fallback={<Loading />}><EntranceScreen mode="token" /></Suspense>}
      />
      <Route
        path="/events/:eventId/checkin"
        element={<Suspense fallback={<Loading />}><CheckInScreen events={events} patchEventById={patchEventById} showToast={showToast} loading={authLoading || syncStatus === SYNC_STATUS.SYNCING} /></Suspense>}
      />
      {/* Host-only draft preview of the event site — renders from local data */}
      <Route
        path="/events/:eventId/preview-site"
        element={<EventSitePreview events={events} />}
      />
      <Route
        path="/events/:eventId/preview-announce/:kind"
        element={<AnnouncementPreview events={events} />}
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
      <Route path="/reset-password" element={<ResetPasswordScreen />} />
      <Route path="/account"       element={<AccountScreen eventCount={events.length} showToast={showToast} />} />
      <Route path="/auth/callback" element={<AuthCallbackScreen />} />

      {/* ── Legal / policy / help pages ── */}
      <Route path="/help"          element={<Suspense fallback={<Loading />}><HelpScreen /></Suspense>} />
      <Route path="/privacy"       element={<Suspense fallback={<Loading />}><PrivacyScreen /></Suspense>} />
      <Route path="/terms"         element={<Suspense fallback={<Loading />}><TermsScreen /></Suspense>} />
      <Route path="/accessibility" element={<Suspense fallback={<Loading />}><AccessibilityScreen /></Suspense>} />

      {/* ── Admin area — lazy-loaded, completely isolated from customer app ── */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<Loading />}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}
