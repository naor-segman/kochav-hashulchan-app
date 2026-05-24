import { STORAGE_KEY } from "../data/constants.js";

// ── Storage adapter interface ─────────────────────────────────────────────────
//
// All persistence goes through the active adapter. Swap it once — everything
// (useEvents and any future hooks) gets the new backend for free.
//
// Adapter contract:
//   load()         → AppState   — read persisted state; return { events: [] } on miss
//   save(state)    → void       — write full state snapshot
//
// To add cloud sync:
//   1. Implement RemoteStorageAdapter using your backend SDK (Supabase, Firebase, …)
//   2. Call setStorageAdapter(new RemoteStorageAdapter(userId)) after sign-in
//   3. Remove the persist() useEffect in useEvents and subscribe to remote changes instead
//
// TODO(auth): wire setStorageAdapter() into a future useUserSession() hook so the
// adapter switches automatically on login/logout.
// ─────────────────────────────────────────────────────────────────────────────

class LocalStorageAdapter {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { events: [] };
  }

  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
}

// Active adapter — LocalStorage until setStorageAdapter() is called.
let _adapter = new LocalStorageAdapter();

/**
 * Swap the storage backend at runtime.
 * Call this from an auth hook after the user signs in.
 * TODO(auth): setStorageAdapter(new RemoteStorageAdapter(user.id))
 */
export function setStorageAdapter(adapter) {
  _adapter = adapter;
}

/** Load the full app state. Returns { events: [] } if nothing is stored. */
export function loadState() {
  return _adapter.load();
}

/** Persist the full app state snapshot. */
export function persist(state) {
  _adapter.save(state);
}
