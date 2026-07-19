import { useState, useEffect, useCallback, useRef } from "react";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { fetchCloudEvents, createCloudEvent } from "../utils/cloudSync.js";

// ── Migration status ──────────────────────────────────────────────────────────

export const MIGRATION_STATUS = {
  IDLE:      "idle",
  MIGRATING: "migrating",
  SUCCESS:   "success",
  FAILED:    "failed",
};

function getDismissedKey(userId) {
  return `kochav_migration_dismissed_${userId}`;
}

// ── useMigration ──────────────────────────────────────────────────────────────
//
// Detects when a logged-in user has local events that haven't been pushed to
// the cloud yet and exposes a one-click migration flow.
//
// Rules:
//  - Never called automatically — only via migrate().
//  - Duplicate-safe: checks existing cloud rows before uploading.
//  - localStorage remains the source of truth throughout.
//  - Dismissed per user (localStorage flag); never nags again after skip.
// ─────────────────────────────────────────────────────────────────────────────

export function useMigration(events, patchEventById, user) {
  const [status,       setStatus]       = useState(MIGRATION_STATUS.IDLE);
  const [progress,     setProgress]     = useState({ done: 0, total: 0 });
  const [error,        setError]        = useState(null);
  const [shouldPrompt, setShouldPrompt] = useState(false);

  // Track which userId we've already run the cloud check for — prevents
  // re-fetching on every render while user object identity changes.
  const checkedForRef = useRef(null);

  useEffect(() => {
    if (!user || !isSupabaseConfigured) {
      setShouldPrompt(false);
      return;
    }

    // Run at most once per logged-in user per session
    if (checkedForRef.current === user.id) return;
    checkedForRef.current = user.id;

    // User explicitly dismissed migration for this account
    if (localStorage.getItem(getDismissedKey(user.id)) === "1") return;

    // No unsynced events — nothing to migrate
    const unsynced = events.filter(e => !e.cloudId);
    if (unsynced.length === 0) return;

    // Ask the cloud whether any of these events are missing
    fetchCloudEvents(user.id)
      .then(cloudEvents => {
        const cloudLocalIds = new Set(cloudEvents.map(e => e.id));
        const needsMigration = unsynced.some(e => !cloudLocalIds.has(e.id));
        setShouldPrompt(needsMigration);
      })
      .catch(() => {
        // Cloud unavailable or table not yet created — silently skip
      });
  }, [user]); // intentionally excludes `events` — check runs once per login

  const dismiss = useCallback(() => {
    if (user) localStorage.setItem(getDismissedKey(user.id), "1");
    setShouldPrompt(false);
    setStatus(MIGRATION_STATUS.IDLE);
    setError(null);
  }, [user]);

  const migrate = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;

    setStatus(MIGRATION_STATUS.MIGRATING);
    setError(null);

    try {
      // Re-fetch cloud events to guard against duplicates (user may have
      // already migrated on another device or browser tab).
      const cloudEvents  = await fetchCloudEvents(user.id);
      const cloudLocalIds = new Set(cloudEvents.map(e => e.id));

      const toMigrate = events.filter(e => !e.cloudId && !cloudLocalIds.has(e.id));
      setProgress({ done: 0, total: toMigrate.length });

      for (let i = 0; i < toMigrate.length; i++) {
        const ev      = toMigrate[i];
        const cloudId = await createCloudEvent(ev, user.id);
        if (cloudId) {
          // Store cloudId locally so this event isn't migrated again.
          // patchEventById also bumps updatedAt/version — acceptable for a
          // one-time migration operation.
          patchEventById(ev.id, { cloudId });
        }
        setProgress({ done: i + 1, total: toMigrate.length });
      }

      // Mark dismissed so the prompt won't reappear for this user
      localStorage.setItem(getDismissedKey(user.id), "1");
      setShouldPrompt(false);
      setStatus(MIGRATION_STATUS.SUCCESS);
    } catch (err) {
      setError(err?.message ?? "שגיאה בייבוא האירועים");
      setStatus(MIGRATION_STATUS.FAILED);
    }
  }, [user, events, patchEventById]);

  return {
    shouldPrompt,
    status,
    progress,
    error,
    migrate,
    dismiss,
    unsyncedCount: events.filter(e => !e.cloudId).length,
  };
}
