import {
  createContext, createElement, useCallback, useContext,
  useEffect, useMemo, useRef, useState,
} from "react";
import { supabase } from "../lib/supabase.js";
import { resetAnalytics } from "../lib/analytics.js";
import { pruneCloudBackedEvents, userStorageKey } from "../utils/storage.js";

/** The service-worker cache that holds Supabase reads — see vite.config.js. */
const SUPABASE_CACHE = "supabase-api";

// Supabase v2 auth — null-safe when VITE_SUPABASE_* env vars are missing.
//
// This is a CONTEXT, not a plain hook. It used to be a plain hook and there are
// nine call sites; on /account four of them were mounted at once (App, usePlan,
// useSubscription, AccountScreen), so one page load made four getSession()
// round-trips and held four live onAuthStateChange subscriptions, each setting
// its own copy of the same user object. Measured before the change: 4 and 4.
// One provider now does it once and every consumer reads the same value.
//
// The file stays `.js` (no JSX, `createElement` instead) purely so the nine
// `import { useAuth } from ".../useAuth.js"` lines did not have to change.
//
// Provides:
//   user    — Supabase User object | null
//   loading — true only during initial session restore; false immediately when
//             Supabase is not configured
//   signIn(email, password) — throws on error
//   signUp(email, password, meta?) — resolves { needsConfirmation: bool }; throws on error
//   signOut()               — throws on error; no-op when not configured

const AuthContext = createContext(null);

/* ── Offline at the venue with a session that expired (second review, סב14) ──
   supabase-js holds the session in localStorage and refreshes the access token
   when it has expired (an hour, by default). With no network that refresh
   retries for ~50 seconds and then resolves with NO session — measured: a
   blank page for 52 s, then guest mode, the host's own events nowhere, on
   /app and on the door screen alike. The events were on the device the whole
   time, under this user's key.
   So when the restore is slow or fails for want of a network, the user in the
   stored session is used for what this device already holds. Nothing is
   widened: that bucket is readable to whoever holds the device anyway, cloud
   writes still need a live token (they fail and retry, as offline writes do),
   and a refresh token that the server has revoked still ends the session —
   supabase-js emits SIGNED_OUT and the handler below runs as usual. */
const RESTORE_WAIT_MS = 4000;

export function storedSessionUser(client = supabase, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(client?.auth?.storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    const u = parsed?.user ?? parsed?.currentSession?.user ?? null;
    return u?.id ? u : null;
  } catch { return null; }
}

const isNetworkFailure = (error) =>
  !!error && (error.name === "AuthRetryableFetchError" || error.status === 0
    || /fetch|network/i.test(String(error.message || "")));

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(!!supabase);

  // The id of whoever was signed in a moment ago. Needed because the SIGNED_OUT
  // event arrives with session === null and no hint of who just left.
  const prevUserIdRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    let settled = false;
    const adoptStoredUser = () => {
      const stored = storedSessionUser();
      if (!stored) return false;
      prevUserIdRef.current = stored.id;
      setUser(stored);
      setLoading(false);
      return true;
    };
    // Slow restore: the stored user, now; the real answer replaces it below.
    const slow = setTimeout(() => { if (!cancelled && !settled) adoptStoredUser(); }, RESTORE_WAIT_MS);

    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (cancelled) return;
        settled = true;
        clearTimeout(slow);
        if (!session && isNetworkFailure(error) && adoptStoredUser()) return;
        prevUserIdRef.current = session?.user?.id ?? null;
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        // Network error during session restore. The stored user if there is
        // one; otherwise logged-out, so the app never stays blank.
        if (cancelled) return;
        settled = true;
        clearTimeout(slow);
        if (!adoptStoredUser()) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      // ── What signing out does to the copy on this device ──────────────────
      //
      // localStorage is the primary store and it is keyed per user, so ending
      // the session left every guest's name and phone number sitting in the
      // browser with no expiry and no way to remove it. On the venue tablet or
      // a borrowed laptop that is somebody else's personal data, still there.
      //
      // The obvious fix — wipe the bucket on logout — is the one thing this
      // codebase must not do. It has already been bitten by "took the cloud
      // copy wholesale, deleted newer local work, then persisted the deletion",
      // and a draft written on venue wifi that never reached the cloud exists
      // in exactly one place: here. Wiping it is unrecoverable, and logout is
      // not consent to destroy work.
      //
      // So sign-out removes exactly what it can prove is recoverable and not a
      // byte more: events with a cloudId whose syncedVersion still equals their
      // version, i.e. pushed and untouched since. Anything mid-debounce, any
      // failed push, anything edited offline, and every legacy event without a
      // syncedVersion all fail that test and stay. By construction the delete
      // set is empty of anything that exists only on this device.
      //
      // What stays is therefore never silent: it is the unsynced work, and the
      // account screen's explicit "clear local data" action is the deliberate,
      // confirmed way to remove that too — which is why it warns first.
      //
      // This lives on the auth event rather than inside signOut() so it also
      // covers the admin screens (they call supabase.auth.signOut() directly),
      // a sign-out performed in another tab, and a refresh token that expired.
      if (event === "SIGNED_OUT" && prevUserIdRef.current) {
        try {
          pruneCloudBackedEvents(userStorageKey(prevUserIdRef.current));
        } catch { /* storage blocked — the session still ends */ }
        // The service worker keeps the account's Supabase reads for up to five
        // minutes (vite.config.js, cache "supabase-api"). On a shared or
        // borrowed device the next person could be served them — guest lists
        // with phone numbers — while the network is slow (102, 28.9).
        try {
          globalThis.caches?.delete(SUPABASE_CACHE)?.catch?.(() => {});
        } catch { /* no Cache API here — nothing was cached */ }
        // PostHog keeps the identified id in localStorage until told otherwise:
        // without this, whoever uses the device next was recorded as the
        // account that just left (second review, סב11 — nothing called it).
        resetAnalytics();
      }

      // The first event after a failed offline refresh is INITIAL_SESSION with
      // no session — while the session is still in storage, to be refreshed
      // when the network returns. That is not a sign-out; keep the user.
      if (event === "INITIAL_SESSION" && !session && storedSessionUser()) return;

      prevUserIdRef.current = session?.user?.id ?? null;
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      clearTimeout(slow);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  // `meta` lands in the auth user's metadata — the signup records which
  // version of the terms was agreed to and when (checklist 103).
  const signUp = useCallback(async (email, password, meta) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/auth/callback",
        ...(meta ? { data: meta } : {}),
      },
    });
    if (error) throw error;
    // session is null when email confirmation is required
    return { needsConfirmation: !data.session };
  }, []);

  // Throws when the server refused or could not be reached (37a). supabase-js
  // then KEEPS the session — it only clears it after a successful logout call,
  // and even `scope: "local"` makes that call first — so the caller must not
  // carry on as though the user had left: the next page would still be theirs.
  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

// Consumer. Same shape the hook always returned, so no call site changed.
//
// Throws rather than falling back to a logged-out default: a component rendered
// outside the provider would otherwise silently show the signed-out UI to a
// signed-in user, which is the failure mode that is hardest to notice and worst
// to ship. Every current call site is inside <App>, which mounts the provider.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
