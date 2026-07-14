import { STORAGE_KEY } from "../data/constants.js";

/** Load the full app state from localStorage. Returns { events: [] } on miss. */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { events: [] };
}

/** Persist the full app state snapshot to localStorage. Returns true on success. */
export function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
