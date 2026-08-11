import {
  createContext, createElement, useCallback, useContext,
  useEffect, useMemo, useRef, useState,
} from "react";
import { supabase } from "../lib/supabase.js";
import { pruneCloudBackedEvents, userStorageKey } from "../utils/storage.js";

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
//   signUp(email, password) — resolves { needsConfirmation: bool }; throws on error
//   signOut()               — no-op when not configured

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(!!supabase);

  // The id of whoever was signed in a moment ago. Needed because the SIGNED_OUT
  // event arrives with session === null and no hint of who just left.
  const prevUserIdRef = useRef(null);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!cancelled) {
          prevUserIdRef.current = session?.user?.id ?? null;
          setUser(session?.user ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        // Network error during session restore — treat as logged-out so the
        // app doesn't stay blank with loading=true forever.
        if (!cancelled) setLoading(false);
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
      }

      prevUserIdRef.current = session?.user?.id ?? null;
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email, password) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + "/auth/callback" },
    });
    if (error) throw error;
    // session is null when email confirmation is required
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
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
