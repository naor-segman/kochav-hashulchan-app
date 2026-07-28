import { useState, useEffect, useCallback, useRef } from "react";
import { loadState, persist, userStorageKey } from "../utils/storage.js";
import { normalizeEvent, updateEventTimestamp } from "../utils/eventHelpers.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  SYNC_STATUS,
  fetchCloudEvents,
  createCloudEvent,
  updateCloudEvent,
  deleteCloudEvent,
} from "../utils/cloudSync.js";

// Cloud events take precedence over local events with the same ID.
// Local-only events (no cloudId, not present in cloud) are kept as-is.
// Exported for tests: this function decides which copy of an event survives,
// so a silent regression here is unrecoverable customer data loss.
export function mergeCloudWithLocal(localEvents, cloudEvents) {
  const cloudLocalIds = new Set(cloudEvents.map(e => e.id));
  const cloudIds      = new Set(cloudEvents.map(e => e.cloudId).filter(Boolean));

  const merged = cloudEvents.map(ce => {
    const normalized = normalizeEvent(ce);
    // Floor plan image is never uploaded to cloud (base64 is too large).
    // Preserve whatever is in localStorage so the image survives hydration.
    const localMatch = localEvents.find(le =>
      le.id === ce.id || (le.cloudId && le.cloudId === ce.cloudId)
    );

    // The cloud row is NOT automatically the truth. A write can fail (venue
    // wifi) or simply not have fired yet — the push is debounced 1500ms, so
    // closing the tab right after an edit leaves the cloud a step behind.
    // Taking the cloud copy wholesale in that state deleted the newer local
    // work and then persisted the deletion, which is unrecoverable. Whichever
    // side was written last wins; the cloud id always comes from the cloud.
    if (localMatch && (localMatch.updatedAt ?? 0) > (ce.updatedAt ?? 0)) {
      return normalizeEvent({
        ...localMatch,
        cloudId: ce.cloudId ?? localMatch.cloudId ?? null,
        // Tokens are minted server-side on first sync; never let a local copy
        // that predates that push resurrect a null token.
        tokens: ce.tokens ?? localMatch.tokens,
      });
    }

    let result = normalized;
    if (localMatch?.floorPlan?.image && !result.floorPlan?.image) {
      // Cloud has no floor plan (positions never synced) but local does. Spread
      // guards against result.floorPlan being null, and tablePositions falls back
      // to the local ones so locally-placed tables aren't wiped on hydration.
      result = { ...result, floorPlan: {
        ...(result.floorPlan || {}),
        image: localMatch.floorPlan.image,
        tablePositions: result.floorPlan?.tablePositions ?? localMatch.floorPlan.tablePositions ?? {},
      } };
    }
    // normalizeEvent always produces a tokens object, so check the raw cloud
    // record (ce) instead of the normalized result — if the DB row had no
    // token columns, preserve the locally-generated tokens unchanged.
    if (localMatch?.tokens && !ce.tokens) {
      result = { ...result, tokens: localMatch.tokens };
    }
    return result;
  });

  for (const le of localEvents) {
    const inCloud = cloudLocalIds.has(le.id) || (le.cloudId && cloudIds.has(le.cloudId));
    if (!inCloud) merged.push(normalizeEvent(le));
  }

  return merged;
}

// ── useEvents ─────────────────────────────────────────────────────────────────
//
// Single source of truth for all event data at runtime.
//
// When user is null (guest):
//   Reads/writes localStorage only — identical to the pre-cloud behaviour.
//
// When user is logged in and Supabase is configured:
//   • HYDRATION: loads cloud events on first login, merges with localStorage.
//   • MUTATIONS: every write is applied locally first (optimistic) then synced
//     to the cloud. Failures leave local data intact.
//   • localStorage always stays in sync as the offline cache / fallback.
// ─────────────────────────────────────────────────────────────────────────────

export function useEvents(user) {
  // Initial (pre-auth) view = guest bucket, drafts only. A cloudId-bearing event
  // in the shared bucket is stale data from a previous logged-in session (older
  // builds used one global key) and must never surface to a guest.
  const [events, setEvents] = useState(() =>
    (loadState().events || []).map(normalizeEvent).filter(Boolean).filter(e => !e.cloudId)
  );
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.LOCAL_ONLY);

  // Refs let callbacks read the latest values without stale-closure issues.
  const eventsRef    = useRef(events);
  const userRef      = useRef(user);
  const loadedForRef = useRef(null);
  // Which account the in-memory `events` belong to → the localStorage key to
  // persist under. null = guest. Prevents writing one user's events under
  // another's key (and vice-versa) as `user` changes.
  const ownerRef     = useRef(null);
  const syncTimers   = useRef({});  // debounce timers keyed by event id
  // Event ids removed before their initial cloud-create resolved, so the create
  // handler can delete the orphaned cloud row instead of letting it resurrect.
  const pendingDeletes = useRef(new Set());

  useEffect(() => () => { Object.values(syncTimers.current).forEach(clearTimeout); }, []);

  useEffect(() => { eventsRef.current = events; });
  useEffect(() => { userRef.current = user; }, [user]);

  // ── PERSISTENCE ─────────────────────────────────────────────────────────────
  // Flush the full snapshot to localStorage under the CURRENT owner's key, so a
  // logged-in user's events are never written to the shared guest bucket (where
  // the next visitor could read them) and never leak into another account.
  useEffect(() => { persist({ events }, userStorageKey(ownerRef.current)); }, [events]);

  // ── CLOUD HYDRATION + PER-USER STORAGE ───────────────────────────────────────
  // Runs once per logged-in user per session.
  // On logout: reverts state to the shared guest bucket.
  useEffect(() => {
    const load = (key) => (loadState(key).events || []).map(normalizeEvent).filter(Boolean);

    if (!user) {
      // LOGOUT → guest bucket, drafts only. The just-logged-out account's events
      // live under their own key and are never shown to a guest.
      if (loadedForRef.current !== null) {
        loadedForRef.current = null;
        ownerRef.current = null;
        setEvents(load(userStorageKey(null)).filter(e => !e.cloudId));
        setSyncStatus(SYNC_STATUS.LOCAL_ONLY);
      }
      return;
    }

    if (loadedForRef.current === user.id) return;
    loadedForRef.current = user.id;
    ownerRef.current = user.id;

    // Start from THIS user's own bucket, plus a one-time migration of any
    // unsynced guest-mode events (cloudId === null) created before logging in
    // — honouring "continue without account, it'll sync later" without ever
    // pulling in a different user's already-synced events.
    const userLocal   = load(userStorageKey(user.id));
    const guestState  = loadState(userStorageKey(null));
    const guestEvents = (guestState.events || []).map(normalizeEvent).filter(Boolean);
    const guestDrafts = guestEvents.filter(e => !e.cloudId);
    const seenIds     = new Set(userLocal.map(e => e.id));
    const seeded      = [...userLocal, ...guestDrafts.filter(e => !seenIds.has(e.id))];
    // Remove the migrated drafts from the guest bucket so they can't later be
    // adopted by a different account on the same browser.
    if (guestDrafts.length) {
      persist({ events: guestEvents.filter(e => e.cloudId) }, userStorageKey(null));
    }
    // Show THIS user's own data immediately (optimistic local-first) — never the
    // pre-login view.
    setEvents(seeded);

    // No cloud configured → auth never yields a user, so this path is unreachable.
    if (!isSupabaseConfigured) return;

    // Reconcile with the cloud in an async flow (keeps setState out of the
    // synchronous effect body). Merge base = the seeded per-user view.
    // Cancellation is not optional here. On a shared machine, A logging out
    // and B logging in inside the fetch window let A's response resolve into
    // B's state — mergeCloudWithLocal keeps every cloud event, so A's guest
    // lists and phone numbers landed in B's dashboard and were then persisted
    // under B's storage key.
    let cancelled = false;
    (async () => {
      setSyncStatus(SYNC_STATUS.SYNCING);
      try {
        const cloudEvents = await fetchCloudEvents(user.id);
        if (cancelled || ownerRef.current !== user.id) return;
        setEvents(prev => mergeCloudWithLocal(prev, cloudEvents));
        setSyncStatus(SYNC_STATUS.SYNCED);
      } catch {
        if (cancelled) return;
        setSyncStatus(SYNC_STATUS.ERROR); // keep the seeded local view on failure
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── MUTATIONS ────────────────────────────────────────────────────────────────

  const addEvent = useCallback((ev) => {
    const normalized = normalizeEvent(ev);
    // Apply locally first so the UI is instant.
    setEvents(prev => [normalized, ...prev]);

    const currentUser = userRef.current;
    if (!currentUser || !isSupabaseConfigured) return;

    setSyncStatus(SYNC_STATUS.SYNCING);
    createCloudEvent(normalized, currentUser.id)
      .then(cloudId => {
        // If the event was deleted while this create was in flight, the local
        // copy is already gone — delete the just-created cloud row so it can't
        // reappear on the next hydration, instead of adding it back.
        const wasDeleted = pendingDeletes.current.delete(normalized.id);
        if (cloudId) {
          if (wasDeleted) {
            deleteCloudEvent(cloudId, currentUser.id).catch(() => {});
          } else {
            setEvents(prev => prev.map(e => e.id === normalized.id ? { ...e, cloudId } : e));
            // Push any edits that arrived during the round-trip so the cloud row stays current.
            const latest = eventsRef.current.find(e => e.id === normalized.id);
            if (latest) updateCloudEvent({ ...latest, cloudId }, currentUser.id).catch(() => {});
          }
        }
        setSyncStatus(SYNC_STATUS.SYNCED);
      })
      .catch(() => {
        pendingDeletes.current.delete(normalized.id); // create failed → no orphan to clean
        setSyncStatus(SYNC_STATUS.ERROR);
      });
  }, []);

  const removeEvent = useCallback((id) => {
    // Capture cloudId before removing from state.
    const ev = eventsRef.current.find(e => e.id === id);

    // Cancel any in-flight debounced update for this event.
    clearTimeout(syncTimers.current[id]);
    delete syncTimers.current[id];

    setEvents(prev => prev.filter(e => e.id !== id));

    const currentUser = userRef.current;
    if (!currentUser || !isSupabaseConfigured) return;
    if (ev?.cloudId) {
      deleteCloudEvent(ev.cloudId, currentUser.id).catch(() => {});
    } else if (ev) {
      // No cloudId yet — its initial create may still be in flight. Flag it so
      // the create handler deletes the orphaned cloud row when it resolves.
      pendingDeletes.current.add(id);
    }
  }, []);

  const patchEventById = useCallback((id, patch) => {
    // Internal cloudId-only patches must not bump updatedAt/version or trigger
    // a cloud write — the row was just created by addEvent.
    const isOnlyCloudId =
      patch !== null &&
      typeof patch === "object" &&
      !Array.isArray(patch) &&
      Object.keys(patch).length === 1 &&
      "cloudId" in patch;

    if (isOnlyCloudId) {
      setEvents(prev => prev.map(e => e.id === id ? { ...e, cloudId: patch.cloudId } : e));
      return;
    }

    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const patched = typeof patch === "function"
        ? patch(e)
        : Object.assign({}, e, patch);
      return updateEventTimestamp(patched);
    }));

    // Debounce cloud writes so rapid-fire patches (e.g. typing in a field)
    // don't generate one request per keystroke.
    clearTimeout(syncTimers.current[id]);
    syncTimers.current[id] = setTimeout(() => {
      const ev          = eventsRef.current.find(e => e.id === id);
      const currentUser = userRef.current;
      if (!ev || !currentUser || !isSupabaseConfigured) return;

      // No cloudId means the initial create failed — offline on the train, say.
      // Without a retry the event stayed local-only for good: every later edit
      // hit this early return, so an hour of guest entry existed on exactly one
      // browser and vanished with its cache. Retry the create on the next edit.
      if (!ev.cloudId) {
        setSyncStatus(SYNC_STATUS.SYNCING);
        createCloudEvent(ev, currentUser.id)
          .then(cloudId => {
            if (!cloudId) { setSyncStatus(SYNC_STATUS.ERROR); return; }
            setEvents(prev => prev.map(e => e.id === id ? { ...e, cloudId } : e));
            setSyncStatus(SYNC_STATUS.SYNCED);
          })
          .catch(() => setSyncStatus(SYNC_STATUS.ERROR));
        return;
      }

      setSyncStatus(SYNC_STATUS.SYNCING);
      updateCloudEvent(ev, currentUser.id)
        .then(() => setSyncStatus(SYNC_STATUS.SYNCED))
        .catch(() => setSyncStatus(SYNC_STATUS.ERROR));
    }, 1500);
  }, []);

  return { events, addEvent, removeEvent, patchEventById, syncStatus };
}
