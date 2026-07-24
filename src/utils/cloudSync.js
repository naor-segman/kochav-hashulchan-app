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
  const guestMap  = new Map((localEvent.guests ?? []).map(g => [g.id, g]));
  const seated    = Object.keys(localEvent.seating ?? {}).reduce((s, id) => s + ((guestMap.get(id)?.count) || 1), 0);
  const total     = (localEvent.guests ?? []).reduce((s, g) => s + (g.count || 1), 0);
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
    rsvp_token:    localEvent.tokens?.rsvp    ?? null,
    invite_token:  localEvent.tokens?.invite  ?? null,
    gift_token:    localEvent.tokens?.gift    ?? null,
    hostess_token: localEvent.tokens?.hostess ?? null,
    collab_token:  localEvent.tokens?.collab  ?? null,
    updated_at:  new Date(localEvent.updatedAt ?? Date.now()).toISOString(),
    payload: {
      localId:          localEvent.id,
      tables:           localEvent.tables           ?? [],
      guests:           localEvent.guests           ?? [],
      seating:          localEvent.seating          ?? {},
      constraints:      localEvent.constraints      ?? [],
      brideName:        localEvent.brideName        ?? "",
      groomName:        localEvent.groomName        ?? "",
      coupleType:       localEvent.coupleType       ?? "bride-groom",
      sideLabels:       localEvent.sideLabels       ?? null,
      celebrantName:    localEvent.celebrantName    ?? "",
      organizationName: localEvent.organizationName ?? "",
      contactName:      localEvent.contactName      ?? "",
      ownerName:        localEvent.ownerName        ?? "",
      customGroups:     Array.isArray(localEvent.customGroups) ? localEvent.customGroups : [],
      customTableTypes: Array.isArray(localEvent.customTableTypes) ? localEvent.customTableTypes : [],
      createdAt:        localEvent.createdAt        ?? Date.now(),
      updatedAt:        localEvent.updatedAt        ?? Date.now(),
      version:          localEvent.version          ?? 1,
      lockedGuests:     Array.isArray(localEvent.lockedGuests) ? localEvent.lockedGuests : [],
      lockedTables:     Array.isArray(localEvent.lockedTables) ? localEvent.lockedTables : [],
      tokens: localEvent.tokens ?? null,
      costs:  localEvent.costs  ?? {},
      giftBitPhone:   localEvent.giftBitPhone   ?? "",
      giftPayboxLink: localEvent.giftPayboxLink ?? "",
      eventSite:      localEvent.eventSite      ?? null,
      noShowPct:      localEvent.noShowPct      ?? 10,
      // Floor plan: sync positions only — the image (base64) is too large for
      // Postgres JSONB and stays in localStorage on each device. If the user
      // opens the event on a new device they will need to re-upload the image,
      // but the table positions will already be in place.
      floorPlanPositions: localEvent.floorPlan?.tablePositions ?? null,
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
    id:               p.localId      ?? cloudRow.id,
    name:             cloudRow.name  ?? "",
    type:             cloudRow.type  ?? "חתונה",
    date:             cloudRow.date  ?? "",
    venue:            cloudRow.venue ?? "",
    brideName:        p.brideName        ?? "",
    groomName:        p.groomName        ?? "",
    coupleType:       p.coupleType       ?? "bride-groom",
    sideLabels:       p.sideLabels       ?? null,
    celebrantName:    p.celebrantName    ?? "",
    organizationName: p.organizationName ?? "",
    contactName:      p.contactName      ?? "",
    ownerName:        p.ownerName        ?? "",
    customGroups:     Array.isArray(p.customGroups) ? p.customGroups : [],
    customTableTypes: Array.isArray(p.customTableTypes) ? p.customTableTypes : [],
    tables:           Array.isArray(p.tables)        ? p.tables       : [],
    guests:           Array.isArray(p.guests)        ? p.guests       : [],
    seating:          (p.seating && typeof p.seating === "object") ? p.seating : {},
    constraints:      Array.isArray(p.constraints)   ? p.constraints  : [],
    createdAt:        p.createdAt ?? new Date(cloudRow.created_at).getTime(),
    updatedAt:        p.updatedAt ?? new Date(cloudRow.updated_at).getTime(),
    version:          cloudRow.version ?? p.version ?? 1,
    cloudId:          cloudRow.id,
    lockedGuests:     Array.isArray(p.lockedGuests) ? p.lockedGuests : [],
    lockedTables:     Array.isArray(p.lockedTables) ? p.lockedTables : [],
    // Prefer the scalar token column, but fall back per-token to the payload's
    // tokens object. A column that is NULL (e.g. added by a later migration)
    // must not clobber an already-shared token still held in payload.tokens —
    // otherwise normalizeEvent regenerates it and the distributed link breaks.
    tokens: (cloudRow.rsvp_token || p.tokens) ? {
      rsvp:    cloudRow.rsvp_token    ?? p.tokens?.rsvp    ?? null,
      invite:  cloudRow.invite_token  ?? p.tokens?.invite  ?? null,
      gift:    cloudRow.gift_token    ?? p.tokens?.gift    ?? null,
      hostess: cloudRow.hostess_token ?? p.tokens?.hostess ?? null,
      collab:  cloudRow.collab_token  ?? p.tokens?.collab  ?? null,
    } : null,
    costs: (p.costs && typeof p.costs === "object") ? p.costs : {},
    giftBitPhone:   p.giftBitPhone   ?? "",
    giftPayboxLink: p.giftPayboxLink ?? "",
    eventSite:      p.eventSite      ?? null,
    noShowPct:      Number.isFinite(p.noShowPct) ? p.noShowPct : 10,
    // Floor plan: positions are synced; image stays in localStorage (too large for cloud).
    // On a new device the user must re-upload the image, but positions are restored.
    floorPlan: p.floorPlanPositions
      ? { image: null, tablePositions: p.floorPlanPositions }
      : null,
  };
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
