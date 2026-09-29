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
];

function canonical(v) {
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

/** Fingerprints of `ev`'s scalar fields, as normalizeEvent would store them —
 *  so a copy read back from the cloud and the copy that was sent agree. */
export function syncBaseOf(ev) {
  return fingerprints(ev);
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
    const b = base[f];
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
