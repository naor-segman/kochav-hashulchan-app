import { supabase, isSupabaseConfigured } from "../lib/supabase.js";

// ── Sync status constants ─────────────────────────────────────────────────────
//
// Attached to local event objects (transiently — not persisted to localStorage)
// to communicate sync state to the UI.
// ─────────────────────────────────────────────────────────────────────────────

export const SYNC_STATUS = {
  LOCAL_ONLY: "local_only", // never pushed to cloud
  SYNCING:    "syncing",    // network request in flight
  SYNCED:     "synced",     // cloud row matches local state
  ERROR:      "error",      // last sync attempt failed
};

// ── Payload mappers ───────────────────────────────────────────────────────────

/**
 * Map a local event object to a Supabase INSERT/UPDATE payload.
 * Scalar columns are extracted for efficient admin queries; the full event
 * JSON goes into `payload` so nothing is lost.
 *
 * @param {object} localEvent  — event from localStorage (normalizeEvent shape)
 * @param {string} userId      — Supabase auth user UUID
 * @returns {object}           — row object suitable for supabase.from("events").insert/update
 */
export function mapLocalEventToCloudPayload(localEvent, userId) {
  const seated = Object.keys(localEvent.seating ?? {}).length;
  const total  = (localEvent.guests ?? []).length;
  const seatedPct = total > 0 ? parseFloat(((seated / total) * 100).toFixed(2)) : 0;

  return {
    user_id:     userId,
    name:        localEvent.name        ?? "",
    type:        localEvent.type        ?? "חתונה",
    date:        localEvent.date        || null,
    venue:       localEvent.venue       || null,
    guest_count: total,
    table_count: (localEvent.tables ?? []).length,
    seated_pct:  seatedPct,
    version:     localEvent.version     ?? 1,
    updated_at:  new Date(localEvent.updatedAt ?? Date.now()).toISOString(),
    payload: {
      localId:      localEvent.id,
      tables:       localEvent.tables       ?? [],
      guests:       localEvent.guests       ?? [],
      seating:      localEvent.seating      ?? {},
      constraints:  localEvent.constraints  ?? [],
      brideName:    localEvent.brideName    ?? "",
      groomName:    localEvent.groomName    ?? "",
      createdAt:    localEvent.createdAt    ?? Date.now(),
      updatedAt:    localEvent.updatedAt    ?? Date.now(),
      version:      localEvent.version      ?? 1,
      lockedGuests: Array.isArray(localEvent.lockedGuests) ? localEvent.lockedGuests : [],
      lockedTables: Array.isArray(localEvent.lockedTables) ? localEvent.lockedTables : [],
    },
  };
}

/**
 * Map a Supabase events row back to a local event object.
 * The local `id` comes from `payload.localId` so the app's routing is stable.
 *
 * @param {object} cloudRow — row from the Supabase events table
 * @returns {object}        — event in normalizeEvent shape, with cloudId set
 */
export function mapCloudEventToLocalEvent(cloudRow) {
  const p = cloudRow.payload ?? {};
  return {
    id:          p.localId      ?? cloudRow.id,
    name:        cloudRow.name  ?? "",
    type:        cloudRow.type  ?? "חתונה",
    date:        cloudRow.date  ?? "",
    venue:       cloudRow.venue ?? "",
    brideName:   p.brideName    ?? "",
    groomName:   p.groomName    ?? "",
    tables:      Array.isArray(p.tables)      ? p.tables      : [],
    guests:      Array.isArray(p.guests)      ? p.guests      : [],
    seating:     (p.seating && typeof p.seating === "object") ? p.seating : {},
    constraints: Array.isArray(p.constraints) ? p.constraints : [],
    createdAt:    p.createdAt ?? new Date(cloudRow.created_at).getTime(),
    updatedAt:    p.updatedAt ?? new Date(cloudRow.updated_at).getTime(),
    version:      cloudRow.version ?? p.version ?? 1,
    cloudId:      cloudRow.id,
    lockedGuests: Array.isArray(p.lockedGuests) ? p.lockedGuests : [],
    lockedTables: Array.isArray(p.lockedTables) ? p.lockedTables : [],
  };
}

// ── Conflict helpers ──────────────────────────────────────────────────────────

/**
 * True when the local copy is newer than the cloud copy.
 * Uses updatedAt (unix ms) as the primary signal and version as a tiebreaker.
 * Pass the result of mapCloudEventToLocalEvent() as `cloudLocal`.
 */
export function isLocalNewer(localEvent, cloudLocal) {
  if (localEvent.updatedAt !== cloudLocal.updatedAt) {
    return localEvent.updatedAt > cloudLocal.updatedAt;
  }
  return (localEvent.version ?? 1) > (cloudLocal.version ?? 1);
}

/**
 * True when the local event is already in sync with the cloud row.
 * Compares version + updatedAt; avoids a full deep-equal on large events.
 */
export function isSynced(localEvent, cloudLocal) {
  return (
    localEvent.cloudId  === cloudLocal.cloudId &&
    localEvent.version  === cloudLocal.version &&
    localEvent.updatedAt === cloudLocal.updatedAt
  );
}

// ── Cloud CRUD ────────────────────────────────────────────────────────────────
//
// All functions are no-ops (return null / []) when Supabase is not configured.
// They throw on network / RLS errors so callers can surface them.
// They are NEVER called automatically — only on explicit user action.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new row in the cloud events table.
 * Returns the generated cloud UUID (use it to set localEvent.cloudId).
 *
 * @param {object} localEvent
 * @param {string} userId
 * @returns {string|null} cloudId, or null if Supabase not configured
 */
export async function createCloudEvent(localEvent, userId) {
  if (!isSupabaseConfigured || !supabase) return null;

  const row = mapLocalEventToCloudPayload(localEvent, userId);
  const { data, error } = await supabase
    .from("events")
    .insert(row)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Update an existing cloud events row.
 * Caller must ensure localEvent.cloudId is set before calling.
 *
 * @param {object} localEvent — must have cloudId
 * @param {string} userId
 * @returns {void}
 */
export async function updateCloudEvent(localEvent, userId) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!localEvent.cloudId) throw new Error("updateCloudEvent: missing cloudId");

  const row = mapLocalEventToCloudPayload(localEvent, userId);
  const { error } = await supabase
    .from("events")
    .update(row)
    .eq("id", localEvent.cloudId)
    .eq("user_id", userId);

  if (error) throw error;
}

/**
 * Delete a cloud events row by cloudId.
 *
 * @param {string} cloudId — UUID of the Supabase row
 * @param {string} userId
 * @returns {void}
 */
export async function deleteCloudEvent(cloudId, userId) {
  if (!isSupabaseConfigured || !supabase) return;
  if (!cloudId) return;

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", cloudId)
    .eq("user_id", userId);

  if (error) throw error;
}

/**
 * Fetch all cloud events for the given user.
 * Returns an empty array if Supabase is not configured.
 *
 * @param {string} userId
 * @returns {object[]} array of local-shaped event objects (mapCloudEventToLocalEvent applied)
 */
export async function fetchCloudEvents(userId) {
  if (!isSupabaseConfigured || !supabase) return [];

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapCloudEventToLocalEvent);
}
