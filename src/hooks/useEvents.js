import { useState, useEffect, useCallback } from "react";
import { loadState, persist } from "../utils/storage.js";
import { normalizeEvent, updateEventTimestamp } from "../utils/eventHelpers.js";

// ── useEvents ─────────────────────────────────────────────────────────────────
//
// Single source of truth for all event data at runtime.
//
// Layer responsibilities:
//   HYDRATION   — pull initial state from the storage layer on first render
//   STATE       — React state owns the live data; no component reads storage directly
//   MUTATIONS   — addEvent / removeEvent / patchEventById are the only write paths
//   PERSISTENCE — every mutation is flushed to the storage layer via useEffect
//
// TODO(cloud-sync): When adding remote storage, the changes are isolated here:
//   1. HYDRATION: replace the synchronous useState initializer with an async fetch
//      and a loading state so the UI can show a spinner before data arrives.
//   2. PERSISTENCE: replace the persist() useEffect with debounced remote writes;
//      optimistic updates keep the UI snappy while the network call is in flight.
//   3. SYNC STATUS: add a { syncStatus: "idle" | "syncing" | "error" } return
//      value so Shell can show a "saving…" indicator in the top bar.
//   4. CONFLICT RESOLUTION: decide on last-write-wins vs CRDT before going multi-device.
// ─────────────────────────────────────────────────────────────────────────────

export function useEvents() {

  // ── HYDRATION ───────────────────────────────────────────────────────────────
  // Synchronous read avoids a flash where events appear empty before hydration.
  // normalizeEvent fills in any fields missing from older saved events so the
  // rest of the app can always assume a complete schema.
  // TODO(cloud-sync): Replace with useState([]) + useEffect async fetch for remote.
  const [events, setEvents] = useState(() =>
    (loadState().events || []).map(normalizeEvent).filter(Boolean)
  );

  // ── PERSISTENCE ─────────────────────────────────────────────────────────────
  // Flush the full snapshot to storage after every mutation.
  // TODO(cloud-sync): Replace with debounced remote writes and remove this effect.
  useEffect(() => { persist({ events }); }, [events]);

  // ── MUTATIONS ───────────────────────────────────────────────────────────────

  const addEvent = useCallback((ev) => {
    setEvents(prev => [ev, ...prev]);
  }, []);

  const removeEvent = useCallback((id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  // Every patch automatically bumps updatedAt + version so callers never
  // need to manage those fields. This is the single write path for all
  // event mutations — screens, auto-assign, constraint changes all go here.
  const patchEventById = useCallback((id, patch) => {
    setEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      const patched = typeof patch === "function"
        ? patch(e)
        : Object.assign({}, e, patch);
      return updateEventTimestamp(patched);
    }));
  }, []);

  return { events, addEvent, removeEvent, patchEventById };
}
