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

/** Remove one bucket from localStorage entirely. Returns true on success. */
export function clearState(key = STORAGE_KEY) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

/**
 * True when the cloud PROVABLY holds this exact event — not "probably", proved.
 *
 * Three conditions, and all three are needed:
 *  - `cloudId`       — a row exists (it is only set once createCloudEvent resolved)
 *  - `syncedVersion` — a finite number: the cloud `version` this client last
 *                      successfully wrote or read. A legacy event that predates
 *                      the field has null here and is treated as unproven.
 *  - `syncedVersion === version` — nothing has been edited since that push.
 *                      `updateEventTimestamp` bumps `version` on every local
 *                      edit and only a successful `updateCloudEvent` moves
 *                      `syncedVersion` up to meet it, so any pending debounced
 *                      write, any failed push, and any offline edit all leave
 *                      the two apart and the event unproven.
 *
 * Conservative on purpose: a false negative costs a stale copy left on the
 * device, a false positive costs somebody their guest list.
 */
export function isCloudBacked(ev) {
  if (!ev || !ev.cloudId) return false;
  if (!Number.isFinite(ev.syncedVersion)) return false;
  return ev.syncedVersion === (ev.version ?? 1);
}

/**
 * Drop from `key` every event the cloud provably holds, keep everything else.
 * Removes the bucket outright when nothing is left, so no empty shell lingers.
 * Returns { removed, kept } counts.
 */
export function pruneCloudBackedEvents(key) {
  const all  = loadState(key).events || [];
  const kept = all.filter(ev => !isCloudBacked(ev));
  if (kept.length === all.length) return { removed: 0, kept: kept.length };
  if (kept.length === 0) {
    clearState(key);
  } else {
    persist({ ...loadState(key), events: kept }, key);
  }
  return { removed: all.length - kept.length, kept: kept.length };
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
