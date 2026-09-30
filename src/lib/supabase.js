import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True when both env vars are present and non-empty.
 * Use this for conditional UI (setup banners, disabled states).
 * Used by: admin screens AND customer auth screens (login, signup, account,
 * cloud sync). Guest-mode event editing never touches Supabase directly.
 */
export const isSupabaseConfigured = !!(url && key);

/**
 * A deadline on every request (third review 30.9, סב50). supabase-js sets none,
 * and the guest RPCs are POSTs the service worker's 5-second fallback never
 * applies to: with the server not answering, the RSVP, invitation, gift,
 * shared-table and door pages still said "טוען…" after 64 seconds on a venue's
 * dead wifi. Each page already turns a failed request into "אין חיבור כרגע";
 * this makes a hung one fail.
 *
 * Not everything is quick: a 10 MB album photo over 3G takes minutes, so file
 * uploads get none, and the AI floor-plan reading gets 90 seconds.
 */
/* And not every database call is small (fourth review 30.9): a 2,000-guest
 * event is ~620 KB of upsert, which 15 s only carries at ~330 kbps sustained
 * upload — venue wifi and 3G may not, and every push AND every retry was then
 * cut off, so the event never reached the cloud at all (before the deadline it
 * was slow and arrived). A body buys a second per 20 KB (≈160 kbps), up to two
 * minutes; reading the host's own events — every event, whole — gets 60 s. */
export function deadlineFor(input, init) {
  const u = String(typeof input === "string" ? input : input?.url || "");
  if (u.includes("/storage/v1/object")) return null;
  if (u.includes("/functions/v1/")) return 90_000;
  const size = typeof init?.body === "string" ? init.body.length : 0;
  const base = u.includes("/rest/v1/events") ? 60_000 : 15_000;
  return Math.min(120_000, base + Math.ceil(size / 20_000) * 1000);
}
export function timedFetch(input, init = {}) {
  const ms = deadlineFor(input, init);
  if (!ms || typeof AbortSignal?.timeout !== "function") return fetch(input, init);
  const timeout = AbortSignal.timeout(ms);
  let signal = timeout;
  if (init.signal) {
    // The caller's own abort still works. Without AbortSignal.any (older
    // Safari) the caller's signal is kept and the deadline dropped.
    if (typeof AbortSignal.any !== "function") return fetch(input, init);
    signal = AbortSignal.any([init.signal, timeout]);
  }
  return fetch(input, { ...init, signal });
}

/**
 * Supabase client — null when env vars are missing.
 * All admin components must check isSupabaseConfigured (or supabase !== null)
 * before making any API call.
 *
 * To configure: copy .env.example to .env.local and fill in your project values.
 *   VITE_SUPABASE_URL      — Project Settings → API → Project URL
 *   VITE_SUPABASE_ANON_KEY — Project Settings → API → anon / public key
 */
export const supabase = isSupabaseConfigured
  ? createClient(url, key, { global: { fetch: timedFetch } })
  : null;
