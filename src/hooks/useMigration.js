import { useState, useEffect, useCallback, useRef } from "react";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { fetchCloudEvents, createCloudEvent } from "../utils/cloudSync.js";
import { syncBaseOf } from "../utils/syncBase.js";

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
//
// And it is where a draft made LOGGED OUT on this browser is offered to the
// account (33d, owner 2.10). useEvents no longer pulls those drafts in at
// sign-in; it hands them over as `drafts.guestDrafts`, and they join the
// account only through migrate() here. Skip declines exactly those drafts for
// this account — they stay on the browser, logged out, and are not offered to
// it again.
// ─────────────────────────────────────────────────────────────────────────────

export function useMigration(events, patchEventById, user, drafts = {}) {
  const { guestDrafts = [], adoptGuestDrafts, declineGuestDrafts, ready = true } = drafts;
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
    // Until useEvents has loaded THIS account, `events` is still the
    // logged-out view — its drafts are offered through `guestDrafts`, not
    // counted here as the account's own unsynced events.
    if (!ready) return;

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
    // `events` is deliberately excluded: this asks the cloud what is missing
    // once per login, and depending on the list would re-ask on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready]);

  const dismiss = useCallback(() => {
    if (guestDrafts.length && declineGuestDrafts) declineGuestDrafts();
    if (user && shouldPrompt) localStorage.setItem(getDismissedKey(user.id), "1");
    setShouldPrompt(false);
    setStatus(MIGRATION_STATUS.IDLE);
    setError(null);
  }, [user, shouldPrompt, guestDrafts.length, declineGuestDrafts]);

  const migrate = useCallback(async () => {
    if (!user || !isSupabaseConfigured) return;

    setStatus(MIGRATION_STATUS.MIGRATING);
    setError(null);

    // The host said yes to the offered drafts: they belong to this account
    // from here, even if the upload below fails (a retry finds them in
    // `events`).
    const adopted = guestDrafts.length && adoptGuestDrafts ? adoptGuestDrafts() : [];

    try {
      // Re-fetch cloud events to guard against duplicates (user may have
      // already migrated on another device or browser tab).
      const cloudEvents  = await fetchCloudEvents(user.id);
      const cloudLocalIds = new Set(cloudEvents.map(e => e.id));

      const local = [...events, ...adopted.filter(a => !events.some(e => e.id === a.id))];
      const toMigrate = local.filter(e => !e.cloudId && !cloudLocalIds.has(e.id));
      setProgress({ done: 0, total: toMigrate.length });

      for (let i = 0; i < toMigrate.length; i++) {
        const ev      = toMigrate[i];
        const created = await createCloudEvent(ev, user.id);
        if (created) {
          // Store cloudId locally so this event isn't migrated again, and the
          // version so the first post-migration edit has a concurrency base.
          // patchEventById also bumps updatedAt/version — acceptable for a
          // one-time migration operation.
          patchEventById(ev.id, { cloudId: created.cloudId, syncedVersion: created.version,
                                  syncBase: syncBaseOf(ev) });
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
  }, [user, events, patchEventById, guestDrafts.length, adoptGuestDrafts]);

  return {
    shouldPrompt: shouldPrompt || guestDrafts.length > 0,
    status,
    progress,
    error,
    migrate,
    dismiss,
    unsyncedCount: events.filter(e => !e.cloudId).length + guestDrafts.length,
    // Named, so the person can tell whether these are theirs at all.
    draftNames: guestDrafts.map(e => e.name || "אירוע בלי שם"),
  };
}
