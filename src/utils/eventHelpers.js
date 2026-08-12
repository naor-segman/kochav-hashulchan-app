import { uid } from "./uid.js";
import { defaultEventSite } from "../data/eventSiteTemplates.js";
import { normalizeAnnouncements } from "../data/announcementTemplates.js";

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
 * Every public-page token an event carries. One list, used by both
 * normalizeEvent and duplicateEvent — they drifted apart once (a duplicated
 * event came back without an `album` token, leaving its album link dead) and a
 * shared list is what stops that from happening again.
 */
export const TOKEN_KEYS = ["rsvp", "album", "invite", "gift", "hostess", "collab"];

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
    // Couple composition for weddings/engagements/henna — drives the default
    // side-role wording so same-sex couples get correct labels.
    // "bride-groom" (default) | "groom-groom" | "bride-bride".
    coupleType:       ev.coupleType       ?? "bride-groom",
    // Custom side labels — optional per-event override of the two side names,
    // available for EVERY event type. Both must be non-empty to take effect;
    // otherwise getSideLabels() falls back to the type-based defaults.
    sideLabels: (ev.sideLabels && typeof ev.sideLabels === "object")
      ? { bride: (ev.sideLabels.bride ?? "").trim(), groom: (ev.sideLabels.groom ?? "").trim() }
      : null,
    // Personal fields — populated depending on event type (bar/bat mitzvah, business, etc.)
    celebrantName:    ev.celebrantName    ?? "",
    organizationName: ev.organizationName ?? "",
    contactName:      ev.contactName      ?? "",
    ownerName:        ev.ownerName        ?? "",
    // Custom groups created by the user for this event.
    // Standard groups come from constants.js GROUP_OPTIONS; this holds only user-created ones.
    customGroups: Array.isArray(ev.customGroups) ? ev.customGroups : [],
    // Custom table types created by the user (strings, e.g. "שולחן ילדים").
    // Standard types live in constants.js TABLE_TYPES; this holds only extras.
    customTableTypes: Array.isArray(ev.customTableTypes) ? ev.customTableTypes : [],
    // Collections — default to empty arrays/objects
    tables:      Array.isArray(ev.tables)      ? ev.tables      : [],
    guests:      Array.isArray(ev.guests)      ? ev.guests      : [],
    seating:     (ev.seating && typeof ev.seating === "object") ? ev.seating : {},
    constraints: Array.isArray(ev.constraints) ? ev.constraints : [],
    // Metadata — fall back gracefully for events that predate these fields
    createdAt:   ev.createdAt                  ?? now,
    // updatedAt defaults to the RESOLVED createdAt (not raw ev.createdAt) so an
    // event missing both timestamps doesn't get updatedAt=0 (epoch 1970).
    updatedAt:   ev.updatedAt                  ?? ev.createdAt ?? now,
    // version 1 = "exists but was never edited under the new schema"
    version:     ev.version                    ?? 1,
    // cloudId — UUID of the Supabase events row; null = never pushed to cloud.
    // Set by cloudSync.createCloudEvent() after first successful upload.
    // Preserved here so it survives localStorage ↔ normalizeEvent round-trips.
    cloudId:     ev.cloudId                    ?? null,
    // The cloud `version` this client last read or wrote — the base for the
    // optimistic-concurrency predicate in updateCloudEvent. Client-side only:
    // deliberately NOT a column and NOT inside `payload`, because it describes
    // this browser's knowledge of the row, not the row itself. null = never
    // synced, in which case the update falls back to the old unconditional
    // write rather than blocking a legacy event from syncing at all.
    syncedVersion: Number.isFinite(ev.syncedVersion) ? ev.syncedVersion : null,
    // Locking — guests/tables excluded from smart-assistant suggestions.
    // Must be preserved here so locks survive page reload (localStorage round-trip).
    lockedGuests: Array.isArray(ev.lockedGuests) ? ev.lockedGuests : [],
    lockedTables: Array.isArray(ev.lockedTables) ? ev.lockedTables : [],
    // Planning checklist. Kept on the event (not a separate store) so it
    // duplicates, syncs and exports with everything else.
    tasks:        Array.isArray(ev.tasks) ? ev.tasks : [],
    // Vendor tracking sits beside the budget, not inside it: the budget says
    // how much, this says who and whether they are actually booked.
    vendors:      Array.isArray(ev.vendors) ? ev.vendors : [],
    // Per-stage record of who was already messaged, and any template the
    // host edited. Both survive an automated-sending switch untouched.
    messagesSent:     (ev.messagesSent && typeof ev.messagesSent === "object") ? ev.messagesSent : {},
    messageTemplates: (ev.messageTemplates && typeof ev.messageTemplates === "object") ? ev.messageTemplates : {},
    // Save-the-Date + designed invitation. Both ride on the invite token,
    // so adding them needed no migration and no new public RPC.
    announcements: normalizeAnnouncements(ev.announcements, ev.type),
    // Floor plan — optional venue sketch uploaded by the user.
    // image: base64 data URL (JPEG, compressed client-side).
    // tablePositions: { [tableId]: { x, y } } — fractional positions (0-1) on the image.
    // elements: [{ id, kind, x, y, size }] — venue fixtures (chuppah, stage, bar…)
    //   that sit on the sketch but never hold guests, so they are not tables.
    floorPlan: (ev.floorPlan && typeof ev.floorPlan === "object")
      ? {
          image:          ev.floorPlan.image ?? null,
          tablePositions: ev.floorPlan.tablePositions ?? {},
          elements:       Array.isArray(ev.floorPlan.elements) ? ev.floorPlan.elements : [],
        }
      : null,
    // Public-URL tokens — stable random UUIDs generated once, never changed.
    // Each token grants access to one public page. Built from TOKEN_KEYS so a
    // new page's token cannot be added here and forgotten in duplicateEvent.
    // When a token was last DELIBERATELY replaced. Without this, rotation is
    // not safe: the hydration merge lets the cloud's token win per key, so a
    // host who kills a leaked link and reloads before the debounced push lands
    // gets the dead link back — and a second device with an older copy pushes
    // it back too. Whichever side rotated more recently wins the whole set.
    tokensRotatedAt: Number.isFinite(ev.tokensRotatedAt) ? ev.tokensRotatedAt : null,
    tokens: Object.fromEntries(
      TOKEN_KEYS.map(k => [k, (ev.tokens && typeof ev.tokens === "object" && ev.tokens[k]) || uid()])
    ),
    // Event cost planning — stored per event, updated via CostScreen.
    costs: (ev.costs && typeof ev.costs === "object") ? ev.costs : {},
    // Digital gift transfer details — shown to guests on the public gift page.
    // bit has no permanent payment links for individuals, so we store the
    // recipient's phone number; PayBox supports shareable group links.
    // The shared guest table's on/off switch. Same link always — the host
    // decides when it answers. Absent means ON, so nothing changes for an event
    // that is already being filled in; only an explicit false closes it, and
    // the token RPCs enforce the same rule server-side.
    collabActive: ev.collabActive === false ? false : true,
    // The entrance link's write switch, same rule and same reason: the greeter
    // marks arrivals through it, the host closes it after the event without
    // invalidating the URL, and absent means open so an existing event is not
    // silently shut. `hostess_writes_active(e)` enforces the identical default
    // in SQL, so a token holder cannot get past a closed switch with curl.
    hostessWriteActive: ev.hostessWriteActive === false ? false : true,
    giftBitPhone:   ev.giftBitPhone   ?? "",
    giftPayboxLink: ev.giftPayboxLink ?? "",
    // Event site — the auto-built guest-facing site (hero, schedule, location,
    // gift, blessings, FAQ). Defaults are seeded per event type; host edits.
    eventSite: normalizeEventSite(ev.eventSite, ev.type),
    // No-show factor (%) for the meal-count forecast. Israeli weddings run
    // ~8–15% no-shows; couples get burned ordering meals for 100% of confirmers.
    noShowPct: Number.isFinite(ev.noShowPct) ? ev.noShowPct : 10,
  };
}

/**
 * Ensure an eventSite object has all required fields, seeding per-type defaults
 * for a fresh event. Preserves existing host-entered content.
 */
export function normalizeEventSite(site, type) {
  const def = defaultEventSite(type);
  if (!site || typeof site !== "object") return def;
  return {
    enabled:      typeof site.enabled === "boolean" ? site.enabled : def.enabled,
    themeKey:     site.themeKey     ?? def.themeKey,
    // Host-owned domain for the public event site. The app stores and uses it;
    // pointing the DNS is the host's step, which the editor spells out.
    customDomain: (site.customDomain ?? "").trim(),
    fontKey:      site.fontKey      ?? def.fontKey ?? "serif",
    heroEn:       site.heroEn       ?? def.heroEn,
    coverPhoto:   site.coverPhoto   ?? null,
    story:        site.story        ?? "",
    gallery:      Array.isArray(site.gallery) ? site.gallery : def.gallery,
    countdown:    typeof site.countdown === "boolean" ? site.countdown : def.countdown,
    dressCode:    site.dressCode    ?? "",
    schedule:     Array.isArray(site.schedule) ? site.schedule : def.schedule,
    address:      site.address      ?? "",
    wazeUrl:      site.wazeUrl      ?? "",
    parkingNote:  site.parkingNote  ?? "",
    shuttles:     Array.isArray(site.shuttles) ? site.shuttles : def.shuttles,
    faq:          Array.isArray(site.faq) ? site.faq : def.faq,
    contactPhone: site.contactPhone ?? "",
    rsvpMessage:  site.rsvpMessage  ?? "",
    sections: (site.sections && typeof site.sections === "object")
      ? { ...def.sections, ...site.sections }
      : def.sections,
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
    // Day-of state belongs to the event that actually happened. Copying it
    // meant duplicating last year's gala produced a copy where everyone was
    // already checked in and the gift total was already banked.
    // `arrivedSeats` is the per-person form of `arrived` and has to be stripped
    // with it. Stripping only the boolean left the copy with
    // `arrivedSeats: [0,1]` — nobody reads as arrived in the summary while the
    // entrance screen shows two of them already inside.
    const { arrived, arrivedSeats, giftAmount, ...rest } = g;   // eslint-disable-line no-unused-vars
    return Object.assign({}, rest, { id: newId });
  });

  const constraints = ev.constraints.map(c => Object.assign({}, c, {
    id:     uid(),
    guestA: guestIdMap[c.guestA] || c.guestA,
    guestB: guestIdMap[c.guestB] || c.guestB,
  }));

  // Remap floor plan table positions to the new table IDs.
  const floorPlan = ev.floorPlan ? {
    image: ev.floorPlan.image,
    tablePositions: Object.fromEntries(
      Object.entries(ev.floorPlan.tablePositions ?? {})
        .filter(([oldId]) => tableIdMap[oldId])
        .map(([oldId, pos]) => [tableIdMap[oldId], pos])
    ),
    // Venue fixtures carry no table references, but each still needs a fresh id
    // so the copy never shares element identity with the original.
    elements: (ev.floorPlan.elements ?? []).map(el => ({ ...el, id: uid() })),
  } : null;

  const now = Date.now();
  return Object.assign({}, ev, {
    id:          uid(),
    name:        "עותק של " + (ev.name || ""),
    tables,
    guests,
    constraints,
    seating:     {},
    floorPlan,
    // Locks reference IDs that don't exist in the duplicate — clear them.
    lockedGuests: [],
    lockedTables: [],
    costs:       {},
    // Tasks carry over — a second event usually needs the same checklist — but
    // reset to "todo" with fresh ids so the copy starts from a clean board.
    tasks: (ev.tasks ?? []).map(t => ({ ...t, id: uid(), status: "todo", doneAt: null })),
    // messagesSent is keyed by GUEST id, and the copy has new guest ids — a
    // carried-over map would match nobody and never be pruned. Start clean.
    messagesSent: {},
    // Deep-copy the remaining nested collections so editing the duplicate never
    // mutates the original (Object.assign only shallow-copies these).
    customGroups:     Array.isArray(ev.customGroups) ? [...ev.customGroups] : [],
    customTableTypes: Array.isArray(ev.customTableTypes) ? [...ev.customTableTypes] : [],
    sideLabels:       ev.sideLabels ? { ...ev.sideLabels } : (ev.sideLabels ?? null),
    eventSite:        ev.eventSite ? JSON.parse(JSON.stringify(ev.eventSite)) : (ev.eventSite ?? null),
    // Each duplicated event gets its own fresh public-URL tokens so that
    // the copy's public links don't collide with the original. Every key in
    // TOKEN_KEYS must be minted here: a missing one is only re-filled if the
    // caller happens to pass the copy back through normalizeEvent, and a caller
    // that doesn't would ship an event with a dead public link.
    tokens:      Object.fromEntries(TOKEN_KEYS.map(k => [k, uid()])),
    cloudId:     null,
    createdAt:   now,
    updatedAt:   now,
    version:     1,
  });
}

// Default side-role wording for couples, by composition. Used when the host
// hasn't typed the partners' names. Same-sex couples get distinct "א׳/ב׳"
// suffixes so the two sides stay tellable apart without names.
const COUPLE_ROLE_WORDS = {
  "bride-groom": { bride: "צד כלה",    groom: "צד חתן"    },
  "groom-groom": { bride: "צד חתן א׳", groom: "צד חתן ב׳" },
  "bride-bride": { bride: "צד כלה א׳", groom: "צד כלה ב׳" },
};

// Couple-type options offered in the setup screen for wedding-like events.
export const COUPLE_TYPES = [
  { value: "bride-groom", label: "כלה וחתן",  brideLabel: "שם הכלה",  groomLabel: "שם החתן"  },
  { value: "groom-groom", label: "חתן וחתן",  brideLabel: "שם החתן",  groomLabel: "שם החתן השני" },
  { value: "bride-bride", label: "כלה וכלה",  brideLabel: "שם הכלה",  groomLabel: "שם הכלה השנייה" },
];

/**
 * Returns both side labels for a given event, keyed by "bride" and "groom"
 * (the internal storage values, preserved for backward compatibility).
 * Priority: custom per-event override → couple-type/name-aware wedding labels
 * → event-type defaults. Labels adapt so the UI feels personal and event-aware.
 */
export function getSideLabels(ev) {
  // Custom per-event override wins for any event type (both must be filled).
  const custom = ev?.sideLabels;
  if (custom && custom.bride && custom.groom) {
    return { bride: custom.bride, groom: custom.groom };
  }
  const type = ev?.type || "חתונה";
  if (type === "חתונה" || type === "אירוס" || type === "חינה") {
    const roles = COUPLE_ROLE_WORDS[ev?.coupleType] || COUPLE_ROLE_WORDS["bride-groom"];
    return {
      bride: ev?.brideName ? "צד " + ev.brideName : roles.bride,
      groom: ev?.groomName ? "צד " + ev.groomName : roles.groom,
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

/**
 * Expand a guest "group" row into one display name per physical seat.
 * A guest represents a party: `count` seats, an optional `companions` list of
 * the other people's names. Named companions render as "רונית (טל)" so it's
 * clear they belong to טל's table; any remaining unnamed seats render as
 * "טל +1", "טל +2" — a chair bound to טל that must not move alone.
 *
 * @returns {string[]} one label per seat, length === guest seat count.
 */
/**
 * Seat + record totals for the seating screens.
 *
 * Declined guests are excluded from BOTH the numerator and the denominator.
 * Counting them on only one side is what produced "19 / 17 מקומות שובצו": a
 * guest who declined but was still sitting at a table inflated the assigned
 * seats while the total only summed active guests.
 *
 * @param {Array}  guests  event guest rows
 * @param {Object} seating { [guestId]: tableId }
 * @returns {{assignedRecords:number,totalRecords:number,assignedSeats:number,totalSeats:number}}
 */
export function seatingTotals(guests, seating) {
  const list   = Array.isArray(guests) ? guests : [];
  const map    = seating || {};
  const active = list.filter(g => g && g.rsvp !== "declined");
  const seats  = g => Math.max(1, g.count || 1);
  const placed = active.filter(g => map[g.id]);
  return {
    assignedRecords: placed.length,
    totalRecords:    active.length,
    assignedSeats:   placed.reduce((s, g) => s + seats(g), 0),
    totalSeats:      active.reduce((s, g) => s + seats(g), 0),
  };
}

export function guestSeatNames(g) {
  if (!g) return [];
  const base  = (g.name || "").trim() || "אורח";
  const count = Math.max(1, g.count || 1);
  const comps = (Array.isArray(g.companions) ? g.companions : [])
    .map(c => (c || "").trim()).filter(Boolean);
  const names = [base];
  comps.forEach(c => { if (names.length < count) names.push(`${c} (${base})`); });
  let extra = 1;
  while (names.length < count) names.push(`${base} +${extra++}`);
  return names.slice(0, count);
}

/**
 * The companions of a row, by their own names — nothing else.
 *
 * guestSeatNames() suffixes every companion with the row's name ("רונית (טל
 * שוורץ)") and pads the unnamed seats with "טל שוורץ +1". That is right on a
 * PRINTED place card, which is read alone on a plate with no context. Inside a
 * table card the row already says "טל שוורץ" one line above, so the suffix is
 * the same name twice and the padding is the row's own name a third time —
 * which is exactly what the host asked about.
 *
 * So: only companions who HAVE a name, clamped to the seats the row actually
 * has (`count - 1`), exactly the way the shared table clamps them. An empty
 * array means there is nothing worth showing — the row's "· N מקומות" already
 * says how many chairs there are.
 *
 * @returns {string[]} 0..count-1 companion names, in the order they were entered.
 */
export function guestCompanionNames(g) {
  if (!g) return [];
  const count = Math.max(1, g.count || 1);
  return (Array.isArray(g.companions) ? g.companions : [])
    .map(c => (c || "").toString().trim())
    .filter(Boolean)
    .slice(0, count - 1);
}
//
// EventSetupScreen uses these to show the right personal fields for each
// event type without embedding business logic in the component.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the personal-fields config for a given event type.
 * kind: "wedding" | "bar" | "bat" | "business" | "owner"
 */
// `divider` is a section heading a host reads while filling the form, not a
// database field name. Five of the seven branches said "פרטים אישיים", which
// tells a bat mitzvah mother nothing she did not already know. Each one now
// names who the section is actually about, in the same voice as the opening
// screen's EVENT_TYPE_HEADINGS.
export function getEventPersonalConfig(type) {
  if (type === "חתונה" || type === "אירוס" || type === "חינה") {
    return { kind: "wedding", divider: "שמות בעלי השמחה" };
  }
  if (type === "בר מצווה") {
    return { kind: "bar", divider: "מי חוגג בר מצווה", label: "שם הבר מצווה", placeholder: "לדוגמה: עידו" };
  }
  if (type === "בת מצווה") {
    return { kind: "bat", divider: "מי חוגגת בת מצווה", label: "שם הבת מצווה", placeholder: "לדוגמה: תמר" };
  }
  if (type === "אירוע עסקי") {
    return { kind: "business", divider: "הארגון שמארח" };
  }
  if (type === "יום הולדת") {
    return { kind: "owner", divider: "למי חוגגים", label: "שם המחוגג/ת", placeholder: "לדוגמה: דניאל" };
  }
  if (type === "אירוע משפחתי") {
    return { kind: "owner", divider: "המשפחה שמתכנסת", label: "שם הגיבור/ה של האירוע", placeholder: "לדוגמה: משפחת כהן" };
  }
  return { kind: "owner", divider: "לכבוד מי האירוע", label: "שם הגיבור/ה", placeholder: "שם הגיבור/ה של האירוע" };
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

/**
 * Replace one public-page token, killing every link already shared for it.
 *
 * This is the only way to revoke a public link. The shared-table link in
 * particular is a FULL grant — whoever holds it can read every phone number,
 * edit, delete and export — so "I sent it to the wrong WhatsApp group" had no
 * remedy at all before this existed.
 *
 * `tokensRotatedAt` is stamped so the hydration merge knows this side is the
 * deliberate one. Returns a NEW event object; the caller decides how to store
 * it.
 *
 * @param {object} ev   the event
 * @param {string} key  one of TOKEN_KEYS
 * @param {number} now  timestamp, injected so the caller owns the clock
 */
export function rotateEventToken(ev, key, now = Date.now()) {
  if (!ev || !TOKEN_KEYS.includes(key)) return ev;
  return {
    ...ev,
    tokens: { ...(ev.tokens ?? {}), [key]: uid() },
    tokensRotatedAt: now,
  };
}
