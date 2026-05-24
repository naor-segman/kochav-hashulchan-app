import { useState, useEffect, useCallback, useRef } from "react";
import { loadState, persist } from "../utils/storage.js";
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
function mergeCloudWithLocal(localEvents, cloudEvents) {
  const cloudLocalIds = new Set(cloudEvents.map(e => e.id));
  const cloudIds      = new Set(cloudEvents.map(e => e.cloudId).filter(Boolean));

  const merged = cloudEvents.map(normalizeEvent);

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
  const [events, setEvents] = useState(() =>
    (loadState().events || []).map(normalizeEvent).filter(Boolean)
  );
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.LOCAL_ONLY);

  // Refs let callbacks read the latest values without stale-closure issues.
  const eventsRef    = useRef(events);
  const userRef      = useRef(user);
  const loadedForRef = useRef(null);
  const syncTimers   = useRef({});  // debounce timers keyed by event id

  useEffect(() => { eventsRef.current = events; });
  useEffect(() => { userRef.current = user; }, [user]);

  // ── PERSISTENCE ─────────────────────────────────────────────────────────────
  // Always flush the full snapshot to localStorage after every mutation so the
  // app works offline and localStorage stays current as an offline cache.
  useEffect(() => { persist({ events }); }, [events]);

  // ── CLOUD HYDRATION ──────────────────────────────────────────────────────────
  // Runs once per logged-in user per session.
  // On logout: reverts state to what's in localStorage.
  useEffect(() => {
    if (!user) {
      if (loadedForRef.current !== null) {
        loadedForRef.current = null;
        setEvents((loadState().events || []).map(normalizeEvent).filter(Boolean));
        setSyncStatus(SYNC_STATUS.LOCAL_ONLY);
      }
      return;
    }

    if (!isSupabaseConfigured)            return;
    if (loadedForRef.current === user.id) return;
    loadedForRef.current = user.id;

    setSyncStatus(SYNC_STATUS.SYNCING);
    fetchCloudEvents(user.id)
      .then(cloudEvents => {
        setEvents(prev => mergeCloudWithLocal(prev, cloudEvents));
        setSyncStatus(SYNC_STATUS.SYNCED);
      })
      .catch(() => {
        setSyncStatus(SYNC_STATUS.ERROR);
        // Keep existing localStorage data — do not wipe local events on failure.
      });
  }, [user]);

  // ── MUTATIONS ────────────────────────────────────────────────────────────────

  const addEvent = useCallback((ev) => {
    // Apply locally first so the UI is instant.
    setEvents(prev => [ev, ...prev]);

    const currentUser = userRef.current;
    if (!currentUser || !isSupabaseConfigured) return;

    setSyncStatus(SYNC_STATUS.SYNCING);
    createCloudEvent(ev, currentUser.id)
      .then(cloudId => {
        if (cloudId) {
          // Store cloudId on the local copy so future patches know where to write.
          setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, cloudId } : e));
        }
        setSyncStatus(SYNC_STATUS.SYNCED);
      })
      .catch(() => setSyncStatus(SYNC_STATUS.ERROR));
  }, []);

  const removeEvent = useCallback((id) => {
    // Capture cloudId before removing from state.
    const ev = eventsRef.current.find(e => e.id === id);

    // Cancel any in-flight debounced update for this event.
    clearTimeout(syncTimers.current[id]);
    delete syncTimers.current[id];

    setEvents(prev => prev.filter(e => e.id !== id));

    const currentUser = userRef.current;
    if (ev?.cloudId && currentUser && isSupabaseConfigured) {
      deleteCloudEvent(ev.cloudId, currentUser.id).catch(() => {});
    }
  }, []);

  const patchEventById = useCallback((id, patch) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const patched = typeof patch === "function"
        ? patch(e)
        : Object.assign({}, e, patch);
      return updateEventTimestamp(patched);
    }));

    // Internal cloudId-only patches (set by addEvent / migration) must not
    // trigger a redundant cloud write — the row was just created.
    const isOnlyCloudId =
      patch !== null &&
      typeof patch === "object" &&
      !Array.isArray(patch) &&
      Object.keys(patch).length === 1 &&
      "cloudId" in patch;
    if (isOnlyCloudId) return;

    // Debounce cloud writes so rapid-fire patches (e.g. typing in a field)
    // don't generate one request per keystroke.
    clearTimeout(syncTimers.current[id]);
    syncTimers.current[id] = setTimeout(() => {
      const ev          = eventsRef.current.find(e => e.id === id);
      const currentUser = userRef.current;
      if (!ev?.cloudId || !currentUser || !isSupabaseConfigured) return;

      setSyncStatus(SYNC_STATUS.SYNCING);
      updateCloudEvent(ev, currentUser.id)
        .then(() => setSyncStatus(SYNC_STATUS.SYNCED))
        .catch(() => setSyncStatus(SYNC_STATUS.ERROR));
    }, 1500);
  }, []);

  return { events, addEvent, removeEvent, patchEventById, syncStatus };
}
