// Flexible column resolver for guest-list imports.
//
// Real-world files rarely match our exact template headers — hosts paste lists
// from other RSVP services, contact exports, or hand-made sheets with headers
// like "שם האורח", "נייד", "מספר מוזמנים", or English "Name"/"Phone"/"Qty".
// buildColumnMap() maps each logical field to whatever header the file actually
// uses, so a normal list imports without the host renaming columns by hand.

// Normalize a header for fuzzy matching: strip spaces, quotes, punctuation, case.
export function normalizeHeader(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s"'׳״.,_\-()/\\|:]+/g, "");
}

// Alias lists per logical field, ordered by specificity. Values are compared
// against normalized header keys. The template's own headers are included so
// downloaded-and-filled templates keep working.
const COLUMN_ALIASES = {
  name:  ["שםמלא", "שםהאורח", "שםאורח", "שם", "שםפרטי", "אורח", "name", "fullname", "guest", "guestname", "guest name"],
  phone: ["טלפוןנייד", "מספרטלפון", "טלפון", "נייד", "פלאפון", "פלא", "phone", "mobile", "cell", "tel", "phonenumber"],
  count: ["כמותמוזמנים", "מספרמוזמנים", "כמותמקומות", "מספרמקומות", "מספראנשים", "כמותאנשים", "מוזמנים", "כמות", "מספר", "count", "qty", "quantity", "seats", "pax", "guests", "amount"],
  side:  ["צדמשפחה", "שיוךצד", "צד", "שיוך", "side", "family"],
  group: ["קבוצה", "קבוצת", "שיוךקבוצה", "group", "category", "table"],
  rsvp:  ["אישורהגעה", "סטטוסהגעה", "rsvp", "סטטוס", "אישור", "status"],
  meal:  ["סוגמנה", "מנה", "כשרות", "meal", "food"],
  notes: ["הערות", "הערה", "notes", "note", "comment", "comments", "remarks"],
};

// Process order matters: assign the most specific / important fields first so a
// header can't be stolen by a looser field (e.g. "table" → group, not count).
const FIELD_ORDER = ["name", "phone", "count", "side", "rsvp", "meal", "group", "notes"];

/**
 * Given a sample row object (header→value), return { field: actualHeaderKey }.
 * Each header is claimed by at most one field. Fields with no match are omitted.
 */
export function buildColumnMap(row) {
  const headers = Object.keys(row || {});
  const normPairs = headers.map(h => ({ key: h, norm: normalizeHeader(h) }));
  const used = new Set();
  const map = {};

  const claim = (field, predicate) => {
    if (map[field]) return;
    const hit = normPairs.find(p => !used.has(p.key) && p.norm && predicate(p.norm));
    if (hit) { map[field] = hit.key; used.add(hit.key); }
  };

  // Pass 1 — exact normalized match (most reliable).
  for (const field of FIELD_ORDER) {
    const aliases = COLUMN_ALIASES[field];
    claim(field, norm => aliases.includes(norm));
  }
  // Pass 2 — containment fallback for headers with extra words.
  for (const field of FIELD_ORDER) {
    const aliases = COLUMN_ALIASES[field];
    claim(field, norm => aliases.some(a => norm.includes(a) || a.includes(norm)));
  }
  return map;
}

// Read a cell for a mapped field, empty string when the column is absent.
export function readCell(row, map, field) {
  const key = map[field];
  return key == null ? "" : row[key];
}

/**
 * Resolve a raw "side" cell to the internal "bride" | "groom" key.
 * Explicit words (חתן/כלה, groom/bride, or the event's own side labels) win;
 * only then does the "second side" heuristic (ב׳ / 2 / b → groom) apply, so a
 * value like "bride" is never mistaken for side B by its leading "b".
 * Defaults to "bride" when nothing matches.
 */
export function parseSide(rawSide, brideLabel, groomLabel) {
  const raw = String(rawSide ?? "").trim();
  const n = raw.toLowerCase();
  if (!raw) return "bride";
  if (raw.includes("חתן") || raw === groomLabel || n.includes("groom")) return "groom";
  if (raw.includes("כלה") || raw === brideLabel || n.includes("bride")) return "bride";
  if (/^(ב|ב['׳’]|2|b)$/.test(n)) return "groom";
  if (/^(א|א['׳’]|1|a)$/.test(n)) return "bride";
  return "bride";
}
