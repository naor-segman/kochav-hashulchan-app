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
    if (raw) return JSON.parse(raw);
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
      console.error("[storage] localStorage quota exceeded — data not saved");
      window.dispatchEvent(new CustomEvent("storage-quota-exceeded"));
    }
    return false;
  }
}
