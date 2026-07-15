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
    // Core identity — generate a fresh uid if the stored id is missing/undefined
    id:          ev.id ?? uid(),
    // Display fields — default to empty strings
    name:        ev.name        ?? "",
    type:        ev.type        ?? "חתונה",
    date:        ev.date        ?? "",
    venue:       ev.venue       ?? "",
    brideName:        ev.brideName        ?? "",
    groomName:        ev.groomName        ?? "",
    // Personal fields — populated depending on event type (bar/bat mitzvah, business, etc.)
    celebrantName:    ev.celebrantName    ?? "",
    organizationName: ev.organizationName ?? "",
    contactName:      ev.contactName      ?? "",
    ownerName:        ev.ownerName        ?? "",
    // Custom groups created by the user for this event.
    // Standard groups come from constants.js GROUP_OPTIONS; this holds only user-created ones.
    customGroups: Array.isArray(ev.customGroups) ? ev.customGroups : [],
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
    // Locking — guests/tables excluded from smart-assistant suggestions.
    // Must be preserved here so locks survive page reload (localStorage round-trip).
    lockedGuests: Array.isArray(ev.lockedGuests) ? ev.lockedGuests : [],
    lockedTables: Array.isArray(ev.lockedTables) ? ev.lockedTables : [],
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
    // Locks reference IDs that don't exist in the duplicate — clear them.
    lockedGuests: [],
    lockedTables: [],
    cloudId:     null,
    createdAt:   now,
    updatedAt:   now,
    version:     1,
  });
}

/**
 * Returns both side labels for a given event, keyed by "bride" and "groom"
 * (the internal storage values, preserved for backward compatibility).
 * Labels adapt to the event type so the UI feels personal and event-aware.
 */
export function getSideLabels(ev) {
  const type = ev?.type || "חתונה";
  if (type === "חתונה" || type === "אירוס" || type === "חינה") {
    return {
      bride: ev.brideName ? "צד " + ev.brideName : "צד כלה",
      groom: ev.groomName ? "צד " + ev.groomName : "צד חתן",
    };
  }
  if (type === "בר מצווה" || type === "בת מצווה") {
    return { bride: "משפחת האם", groom: "משפחת האב" };
  }
  if (type === "אירוע עסקי") {
    return { bride: "הנהלה", groom: "עובדים" };
  }
  if (type === "יום הולדת") {
    return { bride: "משפחה", groom: "חברים" };
  }
  if (type === "אירוע משפחתי") {
    return { bride: "צד האם", groom: "צד האב" };
  }
  return { bride: "צד א׳", groom: "צד ב׳" };
}

/**
 * Returns the display label for a single side ("bride" or "groom").
 * Falls back safely for unknown side values.
 */
export function getSideLabel(ev, side) {
  const labels = getSideLabels(ev);
  return labels[side] ?? (side === "bride" ? "צד א׳" : "צד ב׳");
}
//
// EventSetupScreen uses these to show the right personal fields for each
// event type without embedding business logic in the component.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the personal-fields config for a given event type.
 * kind: "wedding" | "bar" | "bat" | "business" | "owner"
 */
export function getEventPersonalConfig(type) {
  if (type === "חתונה" || type === "אירוס" || type === "חינה") {
    return { kind: "wedding", divider: "שמות בני הזוג" };
  }
  if (type === "בר מצווה") {
    return { kind: "bar", divider: "פרטים אישיים", label: "שם הבר מצווה", placeholder: "לדוגמה: עידו" };
  }
  if (type === "בת מצווה") {
    return { kind: "bat", divider: "פרטים אישיים", label: "שם הבת מצווה", placeholder: "לדוגמה: תמר" };
  }
  if (type === "אירוע עסקי") {
    return { kind: "business", divider: "פרטי הארגון" };
  }
  if (type === "יום הולדת") {
    return { kind: "owner", divider: "פרטים אישיים", label: "שם המחוגג/ת", placeholder: "לדוגמה: דניאל" };
  }
  if (type === "אירוע משפחתי") {
    return { kind: "owner", divider: "פרטים אישיים", label: "שם הגיבור/ה של האירוע", placeholder: "לדוגמה: משפחת כהן" };
  }
  return { kind: "owner", divider: "פרטים אישיים", label: "שם הגיבור/ה", placeholder: "שם הגיבור/ה של האירוע" };
}

/**
 * Returns a helpful placeholder for the event name input, based on event type.
 * Guides users toward descriptive names like "בר המצווה של עידו".
 */
export function getEventNamePlaceholder(type) {
  const map = {
    "חתונה":          "לדוגמה: חתונת טל ונועה",
    "אירוס":          "לדוגמה: אירוסי ליה ואלון",
    "חינה":           "לדוגמה: חינה של נועה",
    "בר מצווה":       "לדוגמה: בר המצווה של עידו",
    "בת מצווה":       "לדוגמה: בת המצווה של תמר",
    "אירוע עסקי":    "לדוגמה: כנס שנתי 2025",
    "אירוע משפחתי":  "לדוגמה: חגיגת יובל למשפחת כהן",
    "יום הולדת":     "לדוגמה: יום הולדת 40 לדניאל",
  };
  return map[type] || "לדוגמה: אירוע סיום 2025";
}
