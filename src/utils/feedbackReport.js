import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { scrubRoute } from "./errorReport.js";

/**
 * Send typed feedback somewhere the owner can actually read it.
 *
 * `reportError` catches what CRASHES. This catches what is merely wrong — the
 * button nobody finds, the wording that misleads, the step that works and is
 * still the wrong step. None of those throw, so no amount of error reporting
 * surfaces them.
 *
 * Unlike `reportError` this one is allowed to fail LOUDLY: a person deliberately
 * typed something and pressed a button, and telling them it was sent when it was
 * not is worse than telling them it failed. So this returns a result instead of
 * swallowing, and the screen says something true either way.
 *
 * The route is scrubbed of public tokens before it leaves the browser — a token
 * in a URL is a credential, and this lands in a table the admin panel reads.
 * `scrubRoute` is imported rather than re-implemented: two copies of a security
 * rule is one copy that will fall behind.
 */
export async function submitFeedback({ kind, message, contact }) {
  const text = String(message || "").trim();
  if (!text) return { ok: false, reason: "empty" };

  if (!isSupabaseConfigured || !supabase) {
    // Nothing to send to. Say so — the screen offers the mail fallback.
    return { ok: false, reason: "offline" };
  }

  try {
    const { data, error } = await supabase.rpc("submit_feedback", {
      p_kind:       kind || "other",
      p_message:    text.slice(0, 4000),
      p_contact:    String(contact || "").trim().slice(0, 200) || null,
      p_route:      typeof window !== "undefined" ? scrubRoute(window.location.pathname) : "",
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
    if (error) return { ok: false, reason: "error" };
    // The RPC returns false when it drops the row on its rate ceiling.
    if (data === false) return { ok: false, reason: "throttled" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
