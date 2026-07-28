import { STORAGE_KEY } from "../data/constants.js";

// localStorage is per-origin, shared by every user of the same browser. To keep
// one account's events from leaking into another's, logged-in data is stored
// under a per-user key; guest (logged-out) data stays under the base key.
export function userStorageKey(userId) {
  return userId ? `${STORAGE_KEY}::u_${userId}` : STORAGE_KEY;
}

/** Load the full app state from localStorage. Returns { events: [] } on miss. */
export function loadState(key = STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      // Guarding only against a THROW wasn't enough: the string "null" parses
      // fine, and `.events` on it threw inside a useState initializer — which
      // the error boundary caught and offered to fix by reloading, which threw
      // again. Nothing short of devtools got the user out.
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...parsed, events: Array.isArray(parsed.events) ? parsed.events : [] };
      }
    }
  } catch { /* corrupt/blocked storage → fall back to empty */ }
  return { events: [] };
}

/** Persist the full app state snapshot to localStorage. Returns true on success. */
export function persist(state, key = STORAGE_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch (err) {
    if (err instanceof DOMException && (
      err.name === "QuotaExceededError" ||
      err.name === "NS_ERROR_DOM_QUOTA_REACHED"
    )) {
      // No console here: CLAUDE.md forbids it, and no host reads a console
      // anyway. The event below is the signal the app can actually surface —
      // silent data loss is the one failure that must never be quiet.
      window.dispatchEvent(new CustomEvent("storage-quota-exceeded"));
    }
    return false;
  }
}
