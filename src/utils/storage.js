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
  if (!cloudHoldsEventData(ev)) return false;
  // The floor-plan sketch never leaves the device (cloudSync.js sends positions
  // and fixtures, never `image`; FloorPlanEditor tells the host "נשמרת במכשיר
  // שלכם בלבד"). An event that holds one is therefore NOT fully in the cloud,
  // however equal its counters are — the sign-out prune deleted the sketch with
  // the event, and the next sign-in brought back everything except it (audit
  // 3.10, L1).
  return !holdsLocalOnlySketch(ev);
}

/** The cloud row holds this event's data — everything that syncs, that is.
 *  Says nothing about the floor-plan image, which never syncs; see
 *  isCloudBacked for the full "nothing is lost if this copy goes" test. */
export function cloudHoldsEventData(ev) {
  if (!ev || !ev.cloudId) return false;
  if (!Number.isFinite(ev.syncedVersion)) return false;
  return ev.syncedVersion === (ev.version ?? 1);
}

/** True when the event carries a floor-plan image — which exists only here. */
export function holdsLocalOnlySketch(ev) {
  return typeof ev?.floorPlan?.image === "string" && ev.floorPlan.image.length > 0;
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

/* ── When the floor-plan sketch does not fit (33b) ───────────────────────────
 * The sketch is a base64 image — by far the largest thing in storage, and the
 * one thing never synced. When a write hit the quota, NOTHING was written: the
 * guest list typed since the last save was lost on reload along with the
 * image, and FloorPlanEditor had already said "saved". Now the write is
 * retried without the images: the event data is kept, the images stay in
 * memory for this visit, and the app is told which events' sketches are not
 * on the device — `FLOORPLAN_NOT_SAVED_EVENT` (detail: { eventIds }) and
 * floorPlansNotSaved(). */
export const FLOORPLAN_NOT_SAVED_EVENT = "storage-floorplan-not-saved";
const notSaved = new Map();   // storage key -> Set of event ids
/** Ids of events whose floor-plan image the last write (to any bucket) had to leave out. */
export function floorPlansNotSaved() {
  return new Set([...notSaved.values()].flatMap(s => [...s]));
}

const isQuota = (err) => err instanceof DOMException && (
  err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");

function withoutImages(state) {
  const ids = [];
  const events = (state?.events || []).map(e => {
    if (!e?.floorPlan?.image) return e;
    ids.push(e.id);
    return { ...e, floorPlan: { ...e.floorPlan, image: null } };
  });
  return { ids, state: { ...state, events } };
}

/** Persist the full app state snapshot to localStorage. Returns true on success
 *  (true also when only the floor-plan images had to be left out — see above). */
export function persist(state, key = STORAGE_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    notSaved.delete(key);
    return true;
  } catch (err) {
    if (!isQuota(err)) return false;
    const lean = withoutImages(state);
    if (lean.ids.length) {
      try {
        localStorage.setItem(key, JSON.stringify(lean.state));
        notSaved.set(key, new Set(lean.ids));
        window.dispatchEvent(new CustomEvent(FLOORPLAN_NOT_SAVED_EVENT, { detail: { eventIds: lean.ids } }));
        return true;
      } catch (err2) {
        if (!isQuota(err2)) return false;
      }
    }
    // No console here: CLAUDE.md forbids it, and no host reads a console
    // anyway. The event below is the signal the app can actually surface —
    // silent data loss is the one failure that must never be quiet.
    window.dispatchEvent(new CustomEvent("storage-quota-exceeded"));
    return false;
  }
}
