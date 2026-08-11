import { useState, useEffect, useCallback, useRef } from "react";
import { loadState, persist, userStorageKey } from "../utils/storage.js";
import { normalizeEvent, updateEventTimestamp, TOKEN_KEYS } from "../utils/eventHelpers.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import {
  SYNC_STATUS,
  fetchCloudEvents,
  createCloudEvent,
  updateCloudEvent,
  deleteCloudEvent,
  CloudConflictError,
} from "../utils/cloudSync.js";

// Tokens are merged PER KEY, never as a whole object.
//
// `album` has no column of its own — it lives only inside `payload`. A cloud row
// written before the album feature therefore comes back with `album: null`, and
// swapping the whole object let that null win. `normalizeEvent` then minted a
// fresh UUID, and every album QR already printed on an invitation 404'd. The
// mapper carries a guard for exactly this hazard; the merge used to re-open it.
//
// Rule: a token that exists on either side survives; the cloud wins only where
// it actually has a value. `fallback` is the already-normalized token set, used
// only where neither side has one — otherwise a key missing on both sides would
// come out null and, past the normalize gateway, stay null.
function mergeTokens(cloudTokens, localTokens, fallback) {
  return Object.fromEntries(
    TOKEN_KEYS.map(k => [k, cloudTokens?.[k] || localTokens?.[k] || fallback?.[k] || null])
  );
}

/**
 * Take the cloud's arrival state for any guest this tab has never expressed an
 * opinion about.
 *
 * "Never expressed an opinion" is precisely `arrivedSeats === undefined` and no
 * truthy `arrived`. That is different from `arrivedSeats: []`, which is the host
 * deliberately un-marking someone — so un-marking still wins, and a host who
 * marks people on their own device still wins. Only the guests the local copy is
 * silent about are taken from the cloud, which is exactly the set the greeter
 * touched after this tab last read the row.
 *
 * A guest missing from either side is left alone; this never adds or removes a
 * row, only two keys on rows that exist on both.
 */
function mergeArrivals(localGuests, cloudGuests) {
  if (!Array.isArray(localGuests) || !Array.isArray(cloudGuests)) return localGuests;
  const cloudById = new Map(cloudGuests.filter(g => g && g.id).map(g => [g.id, g]));
  return localGuests.map(g => {
    const untouched = g.arrivedSeats === undefined && !g.arrived;
    if (!untouched) return g;
    const c = cloudById.get(g.id);
    if (!c || (c.arrivedSeats === undefined && !c.arrived)) return g;
    return { ...g, arrivedSeats: c.arrivedSeats, arrived: c.arrived };
  });
}

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
        // Arrivals are the one thing on this row written by SOMEONE ELSE, from a
        // device this tab never sees — the greeter, through the entrance token.
        // Whole-event last-write-wins therefore cannot be right for them: the
        // host edits the venue at 20:32, their copy is newer by definition, and
        // three people the greeter checked in at 20:31 are dropped and then
        // pushed back over the cloud. Measured: exactly that.
        guests: mergeArrivals(localMatch.guests, ce.guests),
        cloudId: ce.cloudId ?? localMatch.cloudId ?? null,
        // The concurrency base always comes from the row we just read, whichever
        // side's CONTENT wins — otherwise the next push compares against a
        // version the server has already moved past and conflicts forever.
        syncedVersion: ce.syncedVersion ?? localMatch.syncedVersion ?? null,
        // Tokens are minted server-side on first sync; never let a local copy
        // that predates that push resurrect a null token — and never let a
        // cloud row that predates a NEW token (album) erase the local one.
        tokens: mergeTokens(ce.tokens, localMatch.tokens),
      });
    }

    let result = normalized;
    if (localMatch?.floorPlan?.image && !result.floorPlan?.image) {
      // Cloud has no floor plan (positions never synced) but local does. Spread
      // guards against result.floorPlan being null, and tablePositions falls back
      // to the local ones so locally-placed tables aren't wiped on hydration.
      //
      // `elements` needs the same fallback for the same reason: when the cloud
      // copy has no floor plan at all, `result.floorPlan` is null, so the spread
      // contributed no `elements` key and the venue fixtures — chuppah, stage,
      // bar, dance floor — vanished, and that object was what got persisted.
      result = { ...result, floorPlan: {
        ...(result.floorPlan || {}),
        image: localMatch.floorPlan.image,
        tablePositions: result.floorPlan?.tablePositions ?? localMatch.floorPlan.tablePositions ?? {},
        elements:       result.floorPlan?.elements       ?? localMatch.floorPlan.elements       ?? [],
      } };
    }
    // normalizeEvent always produces a tokens object, so check the raw cloud
    // record (ce) instead of the normalized result — per key, so a cloud row
    // that predates one of the tokens cannot erase the local value.
    if (localMatch?.tokens) {
      result = { ...result, tokens: mergeTokens(ce.tokens, localMatch.tokens, result.tokens) };
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
  // Event ids whose cloud-create is in flight, so a second debounced edit
  // cannot fire a duplicate create for the same event.
  const creatingRef    = useRef(new Set());

  useEffect(() => () => { Object.values(syncTimers.current).forEach(clearTimeout); }, []);

  useEffect(() => { eventsRef.current = events; });
  useEffect(() => { userRef.current = user; }, [user]);
  const userId = user?.id ?? null;

  // ── PERSISTENCE ─────────────────────────────────────────────────────────────
  // Flush the full snapshot to localStorage under the CURRENT owner's key, so a
  // logged-in user's events are never written to the shared guest bucket (where
  // the next visitor could read them) and never leak into another account.
  useEffect(() => { persist({ events }, userStorageKey(ownerRef.current)); }, [events]);

  // ── CLOUD HYDRATION + PER-USER STORAGE ───────────────────────────────────────
  // Runs once per logged-in user per session.
  // On logout: reverts state to the shared guest bucket.
  // Keyed on the id, NOT the user object. `useAuth` calls setUser from both
  // getSession() and onAuthStateChange (INITIAL_SESSION, SIGNED_IN,
  // TOKEN_REFRESHED), each producing a NEW object identity for the same person.
  // With `[user]` as the dependency, a token refresh landing mid-hydration ran
  // the cleanup — cancelling the in-flight fetch — and the re-run then returned
  // early on `loadedForRef`, so no replacement fetch ever started. syncStatus
  // stayed SYNCING forever and the next edit pushed a full payload over remote
  // state that had never been read.
  useEffect(() => {
    const load = (key) => (loadState(key).events || []).map(normalizeEvent).filter(Boolean);

    if (!userId) {
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

    if (loadedForRef.current === userId) return;
    loadedForRef.current = userId;
    ownerRef.current = userId;

    // Start from THIS user's own bucket, plus a one-time migration of any
    // unsynced guest-mode events (cloudId === null) created before logging in
    // — honouring "continue without account, it'll sync later" without ever
    // pulling in a different user's already-synced events.
    const userLocal   = load(userStorageKey(userId));
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
        const cloudEvents = await fetchCloudEvents(userId);
        if (cancelled || ownerRef.current !== userId) return;
        setEvents(prev => mergeCloudWithLocal(prev, cloudEvents));
        setSyncStatus(SYNC_STATUS.SYNCED);
      } catch {
        if (cancelled) return;
        setSyncStatus(SYNC_STATUS.ERROR); // keep the seeded local view on failure
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // ── MUTATIONS ────────────────────────────────────────────────────────────────

  // Push one event to the cloud and keep the concurrency base in step.
  //
  // On CloudConflictError the row moved on since this client last read it —
  // someone edited the same event on another device. Re-read the account's rows
  // and let mergeCloudWithLocal decide per event (newest updatedAt wins),
  // instead of overwriting work this tab never loaded.
  const pushUpdate = useCallback(async (ev, uid) => {
    try {
      const version = await updateCloudEvent(ev, uid);
      if (Number.isFinite(version)) {
        setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, syncedVersion: version } : e));
      }
      setSyncStatus(SYNC_STATUS.SYNCED);
    } catch (err) {
      if (err instanceof CloudConflictError) {
        try {
          const cloudEvents = await fetchCloudEvents(uid);
          if (ownerRef.current !== uid) return;
          setEvents(prev => mergeCloudWithLocal(prev, cloudEvents));
          setSyncStatus(SYNC_STATUS.SYNCED);
        } catch {
          setSyncStatus(SYNC_STATUS.ERROR);
        }
        return;
      }
      setSyncStatus(SYNC_STATUS.ERROR);
    }
  }, []);

  const addEvent = useCallback((ev) => {
    const normalized = normalizeEvent(ev);
    // Apply locally first so the UI is instant.
    setEvents(prev => [normalized, ...prev]);

    const currentUser = userRef.current;
    if (!currentUser || !isSupabaseConfigured) return;

    setSyncStatus(SYNC_STATUS.SYNCING);
    creatingRef.current.add(normalized.id);
    createCloudEvent(normalized, currentUser.id)
      .then(created => {
        creatingRef.current.delete(normalized.id);
        // If the event was deleted while this create was in flight, the local
        // copy is already gone — delete the just-created cloud row so it can't
        // reappear on the next hydration, instead of adding it back.
        const wasDeleted = pendingDeletes.current.delete(normalized.id);
        if (created) {
          const { cloudId, version } = created;
          if (wasDeleted) {
            deleteCloudEvent(cloudId, currentUser.id).catch(() => {});
          } else {
            setEvents(prev => prev.map(e =>
              e.id === normalized.id ? { ...e, cloudId, syncedVersion: version } : e));
            // Push any edits that arrived during the round-trip so the cloud row stays current.
            const latest = eventsRef.current.find(e => e.id === normalized.id);
            if (latest) pushUpdate({ ...latest, cloudId, syncedVersion: version }, currentUser.id);
          }
        }
        setSyncStatus(SYNC_STATUS.SYNCED);
      })
      .catch(() => {
        creatingRef.current.delete(normalized.id);
        pendingDeletes.current.delete(normalized.id); // create failed → no orphan to clean
        setSyncStatus(SYNC_STATUS.ERROR);
      });
  }, [pushUpdate]);

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
        // This retry is the same operation as addEvent's create and needs the
        // same two guards, which it did not have:
        //
        //   • in-flight: two edits 1500ms apart during a slow create fired a
        //     SECOND create for one event. The unique token indexes turn that
        //     into an error rather than a duplicate row, so it surfaced as a
        //     spurious "sync failed" AND the second snapshot was never pushed.
        //   • pendingDeletes: an event deleted while the retry was in flight
        //     left an orphaned cloud row that came back on the next hydration.
        if (creatingRef.current.has(id)) return;
        creatingRef.current.add(id);
        setSyncStatus(SYNC_STATUS.SYNCING);
        createCloudEvent(ev, currentUser.id)
          .then(created => {
            creatingRef.current.delete(id);
            const wasDeleted = pendingDeletes.current.delete(id);
            if (!created) { setSyncStatus(SYNC_STATUS.ERROR); return; }
            const { cloudId, version } = created;
            if (wasDeleted) {
              deleteCloudEvent(cloudId, currentUser.id).catch(() => {});
              setSyncStatus(SYNC_STATUS.SYNCED);
              return;
            }
            setEvents(prev => prev.map(e =>
              e.id === id ? { ...e, cloudId, syncedVersion: version } : e));
            // Push whatever arrived during the round-trip, exactly as addEvent
            // does — without this the edit that TRIGGERED the retry was the one
            // change the cloud never received.
            const latest = eventsRef.current.find(e => e.id === id);
            if (latest) pushUpdate({ ...latest, cloudId, syncedVersion: version }, currentUser.id);
            setSyncStatus(SYNC_STATUS.SYNCED);
          })
          .catch(() => {
            creatingRef.current.delete(id);
            pendingDeletes.current.delete(id); // create failed → no orphan to clean
            setSyncStatus(SYNC_STATUS.ERROR);
          });
        return;
      }

      setSyncStatus(SYNC_STATUS.SYNCING);
      pushUpdate(ev, currentUser.id);
    }, 1500);
  }, [pushUpdate]);

  return { events, addEvent, removeEvent, patchEventById, syncStatus };
}
