import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

/**
 * Send a crash somewhere the owner can actually see it.
 *
 * Before this, an exception on a customer's phone went to that browser's
 * console and vanished — the owner found out only if the couple called. An
 * event happens once; there is no second chance to reproduce it afterwards.
 *
 * Never throws and never blocks. If reporting is what breaks, the user must not
 * notice: a failure here is swallowed on purpose.
 */

// A token in a URL is a credential, and this lands in a table the admin panel
// reads. `/rsvp/8f3c…` becomes `/rsvp/:token` — enough to know WHICH screen
// crashed, without carrying the key to somebody's guest list into a log.
const TOKEN_ROUTES = ["rsvp", "invite", "gift", "card", "album", "collab", "hostess",
                      "invitation", "save-the-date"];

export function scrubRoute(pathname) {
  const parts = String(pathname || "").split("/");
  return parts
    .map((part, i) => {
      if (!part) return part;
      if (TOKEN_ROUTES.includes(parts[i - 1])) return ":token";
      // Event ids are uuids or the app's own uid()s — also not worth carrying.
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(part)) return ":id";
      return part;
    })
    .join("/");
}

// Belt and braces on top of the RPC's own 10-minute collapse: a render loop can
// fire hundreds of times a second, and there is no reason to put that on the
// network at all.
const recent = new Map();
const DEDUPE_MS = 60_000;

export function reportError(error, { kind = "render", extra = "" } = {}) {
  try {
    const message = String(error?.message || error || "").slice(0, 500);
    if (!message) return;

    const route = typeof window !== "undefined" ? scrubRoute(window.location.pathname) : "";
    const key   = kind + "|" + message + "|" + route;
    const now   = Date.now();
    const last  = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);

    if (typeof console !== "undefined" && console.error) {
      console.error("[kochav]", kind, message, extra || "");
    }

    if (!isSupabaseConfigured || !supabase) return;

    const stack = [error?.stack || "", extra].filter(Boolean).join("\n---\n").slice(0, 4000);

    supabase.rpc("report_error", {
      p_message:    message,
      p_stack:      stack,
      p_route:      route,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      p_kind:       kind,
    }).then(() => {}, () => {});
  } catch {
    // Reporting must never be the thing that breaks the page.
  }
}

/**
 * Catch what never reaches a React boundary: a listener that throws, a rejected
 * promise nobody awaited, a lazy chunk that 404s after a deploy.
 */
export function installGlobalErrorReporting() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (e) => {
    // Failed <img>/<script> loads also fire this, with no `error` object.
    if (!e?.error) return;
    reportError(e.error, { kind: "window" });
  });

  window.addEventListener("unhandledrejection", (e) => {
    reportError(e?.reason, { kind: "promise" });
  });
}
