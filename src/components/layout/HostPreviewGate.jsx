import { Navigate } from "react-router-dom";
import Loading from "../feedback/Loading.jsx";
import { SYNC_STATUS } from "../../utils/cloudSync.js";

/**
 * The host-only previews (/events/:id/preview-site, /preview-announce/:kind)
 * render from the host's own events, so on a full page load they have to wait
 * for those events exactly like the event screens do.
 *
 * They did not (audit 3.10, V1). Until `supabase.auth.getSession()` resolves,
 * `events` is still the logged-out bucket, so a SIGNED-IN host who opened the
 * preview in a new tab — which is how the editors open it — found no event and
 * was bounced to /app. EventRoutes in App.jsx had already been fixed for the
 * same race; these two routes sat outside it.
 *
 * `ready` is the same flag EventRoutes receives (`!authLoading && eventsReady`).
 */
export default function HostPreviewGate({ events, eventId, ready, syncStatus, children }) {
  const ev = events.find(e => e.id === eventId);
  if (!ev) {
    if (!ready || syncStatus === SYNC_STATUS.SYNCING) return <Loading label="טוענים את האירוע…" />;
    return <Navigate to="/app" replace />;
  }
  return children(ev);
}
