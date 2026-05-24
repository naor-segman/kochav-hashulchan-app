// ── User session stub ─────────────────────────────────────────────────────────
//
// Currently returns a static local identity. No network calls, no tokens.
// The entire app behaves as a single anonymous user stored in localStorage.
//
// TODO(auth): Replace with a real provider when adding cloud sync, e.g.:
//   Supabase:  import { useSession } from "@supabase/auth-helpers-react"
//   Firebase:  import { getAuth, onAuthStateChanged } from "firebase/auth"
//   Clerk:     import { useUser } from "@clerk/nextjs"
//
// Migration checklist (when adding auth):
//   1. Replace getCurrentUserId() with the provider's user.id
//   2. Replace isAuthenticated() with a real auth check
//   3. Call setStorageAdapter(new RemoteStorageAdapter(user.id)) on sign-in
//   4. Call setStorageAdapter(new LocalStorageAdapter()) on sign-out (or clear state)
//   5. Gate createEvent / deleteEvent in App.jsx on isAuthenticated()
//   6. Scope all event queries to getCurrentUserId() on the backend
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinel used for the local-only (unauthenticated) user. */
export const ANONYMOUS_USER_ID = "local";

/**
 * Returns the current user ID.
 * "local" until auth is implemented; becomes the provider user.id after.
 */
export function getCurrentUserId() {
  // TODO(auth): return supabase.auth.getUser()?.id ?? ANONYMOUS_USER_ID;
  return ANONYMOUS_USER_ID;
}

/**
 * True when the user is signed in.
 * Always true locally — every browser session is its own "account".
 */
export function isAuthenticated() {
  // TODO(auth): return supabase.auth.getSession() !== null;
  return true;
}
