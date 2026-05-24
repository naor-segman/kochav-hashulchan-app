import { uid } from "./uid.js";

// ── Event schema helpers ──────────────────────────────────────────────────────
//
// These functions are the single source of truth for the event data shape.
// All event creation, mutation, and loading must pass through here so that
// schema changes (new fields, renames) are applied consistently.
//
// TODO(cloud-sync): normalizeEvent is also the right place to apply
// server-side schema migrations when pulling remote events.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure an event has all required fields.
 * Safe to run on events loaded from localStorage that predate this schema.
 * Never overwrites existing valid values — only fills gaps.
 *
 * TODO(cloud-sync): extend to merge server-sent fields that don't exist locally.
 */
export function normalizeEvent(ev) {
  if (!ev || typeof ev !== "object") return null;
  const now = Date.now();
  return {
    // Core identity
    id:          ev.id,
    // Display fields — default to empty strings
    name:        ev.name        ?? "",
    type:        ev.type        ?? "חתונה",
    date:        ev.date        ?? "",
    venue:       ev.venue       ?? "",
    brideName:   ev.brideName   ?? "",
    groomName:   ev.groomName   ?? "",
    // Collections — default to empty arrays/objects
    tables:      Array.isArray(ev.tables)      ? ev.tables      : [],
    guests:      Array.isArray(ev.guests)      ? ev.guests      : [],
    seating:     (ev.seating && typeof ev.seating === "object") ? ev.seating : {},
    constraints: Array.isArray(ev.constraints) ? ev.constraints : [],
    // Metadata — fall back gracefully for events that predate these fields
    createdAt:   ev.createdAt                  ?? now,
    // updatedAt defaults to createdAt so old events don't look newer than they are
    updatedAt:   ev.updatedAt                  ?? ev.createdAt ?? 0,
    // version 1 = "exists but was never edited under the new schema"
    version:     ev.version                    ?? 1,
    // cloudId — UUID of the Supabase events row; null = never pushed to cloud.
    // Set by cloudSync.createCloudEvent() after first successful upload.
    // Preserved here so it survives localStorage ↔ normalizeEvent round-trips.
    cloudId:     ev.cloudId                    ?? null,
  };
}

/**
 * Return a new copy of the event with updatedAt and version bumped.
 * Called by patchEventById on every mutation — callers never need to touch
 * these fields directly.
 *
 * TODO(cloud-sync): version is a monotonic counter per-device.
 * For multi-device conflict resolution, pair it with a server-assigned
 * lamport clock or vector clock instead.
 */
export function updateEventTimestamp(ev) {
  return Object.assign({}, ev, {
    updatedAt: Date.now(),
    version:   (ev.version ?? 1) + 1,
  });
}

/**
 * Deep clone an event, preserving all IDs.
 * Use this for conflict-resolution snapshots ("take local copy" / "take remote copy").
 * Do NOT use this to create a new event — use duplicateEvent for that.
 *
 * Safe because the event data model is pure JSON (no Date objects, no functions).
 *
 * TODO(cloud-sync): when merging remote and local versions, clone both with
 * cloneEvent, diff the fields, and surface conflicts to the user.
 */
export function cloneEvent(ev) {
  return JSON.parse(JSON.stringify(ev));
}

/**
 * Create a full copy of an event with new IDs for all entities.
 * Used by the "duplicate event" feature. The copy starts as a fresh
 * independent event (version 1, new createdAt).
 */
export function duplicateEvent(ev) {
  const tableIdMap = {};
  const tables = ev.tables.map(t => {
    const newId = uid();
    tableIdMap[t.id] = newId;
    return Object.assign({}, t, { id: newId });
  });

  const guestIdMap = {};
  const guests = ev.guests.map(g => {
    const newId = uid();
    guestIdMap[g.id] = newId;
    return Object.assign({}, g, { id: newId });
  });

  const constraints = ev.constraints.map(c => Object.assign({}, c, {
    id:     uid(),
    guestA: guestIdMap[c.guestA] || c.guestA,
    guestB: guestIdMap[c.guestB] || c.guestB,
  }));

  const now = Date.now();
  return Object.assign({}, ev, {
    id:          uid(),
    name:        "עותק של " + (ev.name || ""),
    tables,
    guests,
    constraints,
    seating:     {},
    createdAt:   now,
    updatedAt:   now,
    version:     1,
  });
}
