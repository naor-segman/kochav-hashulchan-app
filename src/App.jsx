import { useCallback, lazy, Suspense } from "react";
import {
  Routes, Route, Navigate,
  useNavigate, useParams, useLocation,
} from "react-router-dom";
import { uid } from "./utils/uid.js";
import { duplicateEvent } from "./utils/eventHelpers.js";
import { useEvents }      from "./hooks/useEvents.js";
import { useToast }       from "./hooks/useToast.js";
import { useActiveEvent } from "./hooks/useActiveEvent.js";
import Shell              from "./components/layout/Shell.jsx";
import Toast              from "./components/feedback/Toast.jsx";
import DashboardScreen    from "./screens/DashboardScreen.jsx";
import EventSetupScreen   from "./screens/EventSetupScreen.jsx";
import TableBuilderScreen from "./screens/TableBuilderScreen.jsx";
import GuestManagerScreen from "./screens/GuestManagerScreen.jsx";
import ConstraintsScreen  from "./screens/ConstraintsScreen.jsx";
import SeatingScreen      from "./screens/SeatingScreen.jsx";
// Lazy-load the entire admin subtree — Supabase and admin screens never
// appear in the customer-facing initial bundle.
const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));

// ── Event layout + nested routes ─────────────────────────────────────────────
// Rendered for every /events/:eventId/* path.
// Reads eventId from the URL, validates it, provides patchEvent/go/showToast
// to child screens using the same prop API they already use.

function EventRoutes({ events, patchEventById, showToast, toast }) {
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
    if (screen === "dashboard") navigate("/");
    else navigate(`/events/${newEventId || eventId}/${screen}`);
  }, [navigate, eventId]);

  // Unknown event ID → back to dashboard
  if (!activeEvent) return <Navigate to="/" replace />;

  // Derive active tab name from last URL segment ("setup", "tables", …)
  const segments = location.pathname.split("/");
  const screen   = segments[segments.length - 1];

  const sp = { activeEvent, patchEvent, go, showToast };

  return (
    <Shell screen={screen} activeEvent={activeEvent} go={go}>
      <Routes>
        <Route path="setup"       element={<EventSetupScreen   {...sp} />} />
        <Route path="tables"      element={<TableBuilderScreen  {...sp} />} />
        <Route path="guests"      element={<GuestManagerScreen  {...sp} />} />
        <Route path="constraints" element={<ConstraintsScreen   {...sp} />} />
        <Route path="seating"     element={<SeatingScreen       {...sp} />} />
        <Route index              element={<Navigate to="setup" replace />} />
      </Routes>
      {toast && <Toast msg={toast.msg} variant={toast.variant} />}
    </Shell>
  );
}

// ── Root app ──────────────────────────────────────────────────────────────────

export default function App() {
  const { events, addEvent, removeEvent, patchEventById } = useEvents();
  const { toast, showToast }                               = useToast();
  const navigate                                           = useNavigate();

  const createEvent = useCallback((template) => {
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
  }, [addEvent, navigate]);

  const deleteEvent = useCallback((id) => {
    removeEvent(id);
    showToast("האירוע נמחק לצמיתות");
  }, [removeEvent, showToast]);

  const handleDuplicateEvent = useCallback((id) => {
    const original = events.find(e => e.id === id);
    if (!original) return;
    const copy = duplicateEvent(original);
    addEvent(copy);
    navigate(`/events/${copy.id}/setup`);
    window.scrollTo(0, 0);
    showToast("האירוע שוכפל ✓");
  }, [events, addEvent, navigate, showToast]);

  // go() for the dashboard Shell — subnav is hidden on dashboard so only
  // the logo click (→ "/") needs to be handled here.
  const dashGo = useCallback((screen, id) => {
    window.scrollTo(0, 0);
    if (screen === "dashboard") navigate("/");
    else if (id) navigate(`/events/${id}/${screen}`);
  }, [navigate]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Shell screen="dashboard" activeEvent={null} go={dashGo}>
            <DashboardScreen
              events={events}
              onCreateEvent={createEvent}
              onOpenEvent={id => { navigate(`/events/${id}/setup`); window.scrollTo(0, 0); }}
              onDeleteEvent={deleteEvent}
              onDuplicateEvent={handleDuplicateEvent}
            />
            {toast && <Toast msg={toast.msg} variant={toast.variant} />}
          </Shell>
        }
      />
      <Route
        path="/events/:eventId/*"
        element={
          <EventRoutes
            events={events}
            patchEventById={patchEventById}
            showToast={showToast}
            toast={toast}
          />
        }
      />
      {/* ── Admin area — lazy-loaded, completely isolated from customer app ── */}
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={null}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
