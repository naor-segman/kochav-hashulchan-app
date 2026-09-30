/* The last-synced copy of an event's single-value fields, as fingerprints
 * (third review 30.9, סב55).
 *
 * The merge decides whole-event "who wins on scalars" by `updatedAt`. That is
 * right when one side edited and the other did not, and wrong the moment both
 * did: the phone renames the venue and pushes; the laptop, still holding the
 * copy from yesterday, edits a guest note later; on its next load the laptop's
 * copy is newer, wins every scalar, and pushes yesterday's venue back over the
 * phone's. Measured on the code before this file: the venue reverted.
 *
 * The missing piece is the common ancestor. `syncBase` holds, per field, a
 * fingerprint of the value the cloud held at `syncedVersion` — recorded
 * whenever the two are known to agree (a pull, a push that landed). Then:
 *
 *   only the cloud moved from the base → the cloud's value
 *   only this device moved             → this device's value
 *   both moved, or no base yet         → the old rule (newer updatedAt)
 *
 * Fingerprints, not copies: `eventSite` alone can be tens of kilobytes and the
 * whole thing sits in localStorage beside the event. A fingerprint that
 * disagrees for a representational reason (a default filled in, a key order)
 * only ever falls back to the old rule, or picks a value equal to the other.
 * Client-side only — neither cloud mapper carries it.
 */
import { normalizeEvent } from "./eventHelpers.js";

export const SCALAR_FIELDS = [
  "name", "type", "date", "venue",
  "brideName", "groomName", "coupleType", "parentsType", "sideLabels",
  "celebrantName", "organizationName", "contactName", "ownerName",
  "collabActive", "hostessWriteActive", "giftBitPhone", "giftPayboxLink",
  "eventSite", "announcements", "noShowPct", "costs",
  // Lists and maps the merge UNIONS but that keep no record of deletions. A
  // union brings back what the other device removed — a custom group, a
  // "sent" mark the host reset, an edited template put back to default — and
  // since סב67 a stale laptop merely opening the app pushed it back (fifth
  // review 30.9). Against the base: only the cloud changed it → the cloud's.
  "customGroups", "customTableTypes", "messagesSent", "messageTemplates",
];

export function canonical(v) {
  if (v === undefined || v === null) return "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (typeof v === "object") {
    return `{${Object.keys(v).sort()
      .filter(k => v[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// cyrb53 — 53 bits, plenty for "did this field change".
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Only the scalar fields (and `type`, which the event-site and announcement
// defaults depend on) go through normalizeEvent: normalising 800 guests to
// fingerprint a venue name is not a price worth paying on every merge.
function fingerprints(ev) {
  if (!ev || typeof ev !== "object") return null;
  const n = normalizeEvent(Object.fromEntries(
    SCALAR_FIELDS.filter(f => f in ev).map(f => [f, ev[f]])));
  return Object.fromEntries(SCALAR_FIELDS.map(f => [f, hash(canonical(n[f]))]));
}

/* ── Per guest field (fifth review 30.9) ─────────────────────────────────────
 * Guest rows merged WHOLE: whichever side won on the event's updatedAt kept its
 * copy of every row both sides hold, so a note typed offline was lost the
 * moment any other device edited anything later, and a stale device that
 * renamed the venue wrote its old copy of a guest over a note already in the
 * cloud. The sync agent's fuzz: a single-editor guest field lost in 244 of 400
 * seeds; 0 with this. Same cure as the scalars — a per-field common ancestor,
 * stored compactly (one string per guest, one-letter keys, ~25-bit hashes: a
 * collision only makes a moved field read as unmoved, i.e. the old rule).
 * Arrival fields are left to mergeArrivals, which decides them by stamp. */
const ARRIVAL_KEYS = new Set(["arrivedSeats", "arrived", "arrivedAt"]);
const gfp = (v) => hash(canonical(v === undefined ? null : v)).slice(-5);
const KEY_CODE = { name: "n", phone: "p", side: "s", group: "g", count: "c", notes: "o", rsvp: "r", meal: "m",
  companions: "k", invitedCount: "i", tableType: "t", email: "e" };
const code = (k) => KEY_CODE[k] ?? k;
const ABSENT = gfp(null);

/** `{ [guestId]: "key:fp,key:fp" }`, over the rows as normalizeEvent stores them. */
export function guestFingerprints(guests) {
  if (!Array.isArray(guests)) return null;
  const rows = normalizeEvent({ guests }).guests;
  const out = {};
  for (const g of rows) {
    if (!g || typeof g !== "object" || !g.id) continue;
    const parts = [];
    for (const k of Object.keys(g)) {
      if (k === "id" || ARRIVAL_KEYS.has(k) || g[k] === undefined || g[k] === null) continue;
      parts.push(`${code(k)}:${gfp(g[k])}`);
    }
    out[g.id] = parts.join(",");
  }
  return out;
}

function parseRowBase(s) {
  const m = new Map();
  if (typeof s !== "string" || !s) return m;
  for (const p of s.split(",")) { const i = p.indexOf(":"); if (i > 0) m.set(p.slice(0, i), p.slice(i + 1)); }
  return m;
}

/** One row on both sides: per field, the side that moved from the base wins;
 *  both moved, or no base for the row → the old whole-row rule (`preferLocal`). */
export function threeWayGuestRow(local, cloud, rowBase, preferLocal) {
  if (typeof rowBase !== "string") return { row: preferLocal ? local : cloud, localKept: false };
  const base = parseRowBase(rowBase);
  const out = { ...(preferLocal ? local : cloud) };
  let localKept = false;
  for (const k of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    if (k === "id" || ARRIVAL_KEYS.has(k)) continue;
    const b = base.get(code(k)) ?? ABSENT;
    const l = gfp(local[k]), c = gfp(cloud[k]);
    if (l === c) continue;
    const lMoved = l !== b, cMoved = c !== b;
    if (lMoved === cMoved) continue;
    const src = lMoved ? local : cloud;
    if (lMoved) localKept = true;
    if (src[k] === undefined) delete out[k]; else out[k] = src[k];
  }
  return { row: out, localKept };
}

// Cheap equality before any hashing: the same primitives, and arrays with the
// same items — true for the overwhelming majority of rows in any merge.
function sameRow(a, b) {
  if (a === b) return true;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    const x = a[k], y = b[k];
    if (x === y) continue;
    if (Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((v, i) => v === y[i])) continue;
    return false;
  }
  return true;
}

/** threeWayGuestRow over every id both sides hold, on an already-unioned list;
 *  what mergeArrivals decided on each merged row is kept. */
export function threeWayGuests(mergedRows, localRows, cloudRows, baseGuests, preferLocal) {
  if (!baseGuests || !Array.isArray(mergedRows) || !Array.isArray(localRows) || !Array.isArray(cloudRows)) {
    return { rows: mergedRows, localKept: false };
  }
  const L = new Map(localRows.filter(g => g?.id).map(g => [g.id, g]));
  const C = new Map(cloudRows.filter(g => g?.id).map(g => [g.id, g]));
  let localKept = false;
  const rows = mergedRows.map(g => {
    const l = L.get(g?.id), c = C.get(g?.id);
    if (!l || !c || sameRow(l, c)) return g;   // almost every row: nothing to decide
    const r = threeWayGuestRow(l, c, baseGuests[g.id], preferLocal);
    if (r.localKept) localKept = true;
    const merged = { ...r.row };
    for (const k of ARRIVAL_KEYS) { if (k in g) merged[k] = g[k]; else delete merged[k]; }
    return merged;
  });
  return { rows, localKept };
}

/** Fingerprints of `ev`'s scalar fields, as normalizeEvent would store them —
 *  so a copy read back from the cloud and the copy that was sent agree — and
 *  of every guest's fields, under `guests`. */
export function syncBaseOf(ev) {
  const f = fingerprints(ev);
  if (f) { const g = guestFingerprints(ev?.guests); if (g) f.guests = g; }
  return f;
}

/**
 * Per field, overrides `merged` where exactly one side moved from `base`.
 * Returns `{ event, localKept }` — `localKept` says a local value survived
 * that the cloud does not hold, so the result has to be pushed.
 */
export function threeWayScalars(merged, local, cloud, base) {
  if (!base || !local || !cloud) return { event: merged, localKept: false };
  const fl = fingerprints(local);
  const fc = fingerprints(cloud);
  const fm = fingerprints(merged);
  let event = merged;
  let localKept = false;
  for (const f of SCALAR_FIELDS) {
    const b = base?.[f];
    if (typeof b !== "string") continue;
    const lMoved = fl[f] !== b;
    const cMoved = fc[f] !== b;
    if (lMoved === cMoved) continue;   // a real conflict (old rule), or no change
    if (cMoved) {
      if (fm[f] !== fc[f]) event = { ...event, [f]: cloud[f] };
    } else {
      if (fm[f] !== fl[f]) event = { ...event, [f]: local[f] };
      localKept = true;
    }
  }
  return { event, localKept };
}
