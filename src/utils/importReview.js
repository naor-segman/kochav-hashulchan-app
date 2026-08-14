/**
 * What the host is shown before a pasted list becomes guests.
 *
 * WHY THIS EXISTS
 * The owner's objection to the paste feature, in his words: if it cannot match
 * a main name to a main name, companions to companions and the phone to the
 * phone, then adding from a list is irrelevant and will only make a mess.
 *
 * The parser was measured at 8 correct out of 19 realistic lines and is now 19
 * of 19 — but that is not the answer on its own, and it never can be. Israeli
 * guest lists have no format: they are WhatsApp threads, a spreadsheet column,
 * a note typed one-handed. No parser on free text is ever 100%, and the other
 * option — teaching hosts a format — fails on the person who already HAS a
 * list and is not going to retype it.
 *
 * So the parser does not have to be perfect. It has to be CORRECTABLE. Show
 * what we understood, let the host fix the three rows we got wrong, and let
 * nothing land in the guest list until they say so. That turns a wrong guess
 * from a mess they discover a week later into two seconds of typing.
 *
 * This module is the data behind that screen: it holds no React, so the rules
 * can be tested directly rather than through a rendered table.
 */

import { normalizePhone } from "./parseGuestList.js";

/** Digits only, so "050-123-4567" and "0501234567" are the same number. */
const digits = s => String(s ?? "").replace(/\D/g, "");

/** Case- and whitespace-insensitive, for comparing names people typed twice. */
const nameKey = s => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The warnings a row can carry.
 *
 * `tone` decides how loud the row is. Only `warn` is worth colouring — a
 * missing phone is the ordinary state of half of any list and must not paint
 * two hundred rows amber, or the colour stops meaning anything.
 */
export const IMPORT_WARNINGS = {
  duplicate:     { tone: "warn", label: "כבר ברשימה" },
  missingNames:  { tone: "warn", label: "חסרים שמות" },
  noPhone:       { tone: "info", label: "בלי טלפון" },
};

/**
 * Warnings for one row, most serious first.
 *
 * `existingKeys` carries the guest list as it already stands, so the second
 * paste of the same WhatsApp thread does not quietly double everybody.
 */
function warningsFor(row, existingKeys) {
  const out = [];
  const phone = digits(row.phone);
  if ((phone && existingKeys.phones.has(phone)) || existingKeys.names.has(nameKey(row.name))) {
    out.push("duplicate");
  }
  // "+2" with no names is three seats and only one person we can print. The
  // host may well not know the names yet, so this is a flag and never a block.
  const seats = row.count || 1;
  if (seats > 1 && (row.companions?.length ?? 0) < seats - 1) out.push("missingNames");
  if (!phone) out.push("noPhone");
  return out;
}

/** The set of names and phones already in the event, for duplicate detection. */
export function existingKeysOf(guests) {
  return {
    names:  new Set((guests || []).map(g => nameKey(g?.name)).filter(Boolean)),
    phones: new Set((guests || []).map(g => digits(g?.phone)).filter(Boolean)),
  };
}

/**
 * Turn parser output into editable review rows.
 *
 * Every row gets a stable `id` so React keys, edits and removals survive a
 * re-render — the parser hands back plain objects with nothing to key on, and
 * keying on the index means editing row 3 after deleting row 1 edits the wrong
 * person.
 */
export function buildImportRows(parsed, existingGuests = []) {
  const keys = existingKeysOf(existingGuests);
  return (parsed || []).map((r, i) => {
    const row = {
      id:         `imp-${i}`,
      name:       r.name ?? "",
      phone:      r.phone ?? "",
      count:      r.count || 1,
      companions: Array.isArray(r.companions) ? [...r.companions] : [],
    };
    return { ...row, warnings: warningsFor(row, keys) };
  });
}

/**
 * Apply one edit and re-derive everything that depends on it.
 *
 * Seats and companion names are the same fact written twice, so an edit to
 * either has to fix the other or the row can be saved in a state the rest of
 * the app treats as impossible (companions.length > count - 1). Lowering the
 * seat count TRIMS the names — which is destructive, and is exactly why this
 * happens on a review screen the host is looking at rather than silently on
 * the way in.
 */
export function editImportRow(rows, id, patch, existingGuests = []) {
  const keys = existingKeysOf(existingGuests);
  return (rows || []).map(r => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };

    if (patch.phone !== undefined) next.phone = normalizePhone(patch.phone) || String(patch.phone ?? "").trim();

    if (patch.count !== undefined) {
      const n = Math.max(1, Math.min(50, Math.round(Number(patch.count) || 1)));
      next.count = n;
      next.companions = (next.companions || []).slice(0, n - 1);
    }
    if (patch.companions !== undefined) {
      const list = (patch.companions || []).map(c => String(c ?? "").trim());
      // Growing the names grows the seats: typing a third name means a third
      // chair, and making the host then also correct the number would be the
      // product asking them to say the same thing twice.
      next.companions = list.slice(0, 49);
      next.count = Math.max(next.count || 1, next.companions.filter(Boolean).length + 1);
    }
    return { ...next, warnings: warningsFor(next, keys) };
  });
}

/** Drop a row the host does not want — a header we misread, a duplicate. */
export function removeImportRow(rows, id) {
  return (rows || []).filter(r => r.id !== id);
}

/**
 * What the confirm button says.
 *
 * Rows and SEATS are different numbers the moment one line says "+2", and the
 * seats are what the tables have to hold — so both are shown, the same way the
 * paste box already did.
 */
export function importSummary(rows) {
  const list = rows || [];
  return {
    rows:      list.length,
    seats:     list.reduce((n, r) => n + (r.count || 1), 0),
    withPhone: list.filter(r => digits(r.phone)).length,
    flagged:   list.filter(r => (r.warnings || []).some(w => IMPORT_WARNINGS[w]?.tone === "warn")).length,
  };
}

/** Rows that are ready to become guests — a blank name is not a person. */
export function readyImportRows(rows) {
  return (rows || []).filter(r => String(r.name ?? "").trim());
}
