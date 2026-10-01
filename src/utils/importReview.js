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

import { normalizePhone, nameMatchKey } from "./parseGuestList.js";

/** Digits only, so "050-123-4567" and "0501234567" are the same number. */
const digits = s => String(s ?? "").replace(/\D/g, "");

/** For comparing names people typed twice — the parser's own rule. */
const nameKey = nameMatchKey;

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
  // FILLED names: a partner placeholder ("+ בת זוג") is a seat with an empty
  // name, and counting entries let it pass unflagged (fifth review 30.9).
  const named = (row.companions || []).filter(c => String(c || "").trim()).length;
  if (seats > 1 && named < seats - 1) out.push("missingNames");
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
  return recomputeWarnings((parsed || []).map((r, i) => ({
    id:         `imp-${i}`,
    name:       r.name ?? "",
    phone:      r.phone ?? "",
    count:      r.count || 1,
    companions: Array.isArray(r.companions) ? [...r.companions] : [],
    // A second phone in the same cell lands here (סב91) — carried to the guest.
    notes:      typeof r.notes === "string" ? r.notes : "",
  })), existingGuests);
}

/**
 * Warnings for the whole set, because a duplicate is a relationship between two
 * rows and not a property of one.
 *
 * `existingKeysOf` looks only at the guest list as it already stands, so the one
 * shape the parser deliberately lets through went unflagged: it de-dupes on
 * `name|phone` (spouses share a household line), which means the same person
 * once bare and once with a number — exactly what a WhatsApp export produces for
 * an unsaved versus a saved contact — arrives as two rows with no warning at
 * all. Measured: both were marked ready, and both became guests. A phantom
 * person and a phantom seat, in the meal count the caterer is given.
 *
 * The keys accumulate as the list is walked, so the FIRST occurrence is clean
 * and each later one is flagged — the same rule as against the existing list.
 * Two real families called "משפחת כהן" therefore raise a flag, which is correct:
 * this screen exists so the host looks, and a duplicate has never been a block.
 */
function recomputeWarnings(rows, existingGuests = []) {
  const keys = existingKeysOf(existingGuests);
  return (rows || []).map(row => {
    const marked = { ...row, warnings: warningsFor(row, keys) };
    const phone = digits(row.phone);
    if (phone) keys.phones.add(phone);
    const nk = nameKey(row.name);
    if (nk) keys.names.add(nk);
    return marked;
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
  const edited = (rows || []).map(r => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };

    if (patch.phone !== undefined) next.phone = normalizePhone(patch.phone) || String(patch.phone ?? "").trim();

    // The seats box, while the host is still typing in it (`typing`), is only
    // a draft: read as 1 on every keystroke, clearing it to type "12" cut every
    // companion name, and "12" then read "112" (fifth review 30.9). Names are
    // trimmed to the seats when the number is COMMITTED (blur), in front of the
    // host, as before.
    delete next.typing;
    if (patch.count !== undefined) {
      delete next.countDraft;
      const raw = String(patch.count).trim();
      if (patch.typing) {
        next.countDraft = raw;
        if (raw !== "") next.count = Math.max(1, Math.min(50, Math.round(Number(raw) || 1)));
      } else {
        const n = Math.max(1, Math.min(50, Math.round(Number(raw) || 1)));
        next.count = n;
        next.companions = (next.companions || []).slice(0, n - 1);
        delete next.companionsText;
      }
    }
    // The names box is kept AS TYPED while the host types: splitting and
    // trimming every keystroke ate the space in "יובל סגמן" the moment it was
    // typed — "יובלסגמן" (fifth review 30.9).
    if (patch.companionsText !== undefined) next.companionsText = String(patch.companionsText);
    const compIn = patch.companionsText !== undefined ? next.companionsText.split(",") : patch.companions;
    if (compIn !== undefined) {
      if (patch.companionsText === undefined) delete next.companionsText;
      const list = (compIn || []).map(c => String(c ?? "").trim());
      // Growing the names grows the seats: typing a third name means a third
      // chair, and making the host then also correct the number would be the
      // product asking them to say the same thing twice.
      next.companions = list.slice(0, 49);
      // An empty slot BEFORE a name is a seat too — the unnamed partner of
      // "דנה (בן/בת זוג, רון)". Counting only the filled names, ", רון, נועה"
      // kept three seats and the import cut נועה off the end, with no flag
      // (sixth review 30.9). Empties after the last name are a comma typed on
      // the way to the next one, not a chair.
      const lastNamed = next.companions.reduce((at, c, i) => (c ? i : at), -1);
      next.count = Math.min(50, Math.max(next.count || 1, lastNamed + 2));
    }
    return next;
  });
  // The whole set, not just this row: renaming row 3 to match row 1 makes row 3
  // a duplicate, and renaming it back makes it clean again.
  return recomputeWarnings(edited, existingGuests);
}

/**
 * Drop a row the host does not want — a header we misread, a duplicate.
 *
 * Recomputed for the same reason as an edit, in the other direction: removing
 * the FIRST of two identical rows must clear the warning from the second, or
 * the host is left staring at a duplicate flag on the only copy that remains.
 */
export function removeImportRow(rows, id, existingGuests = []) {
  return recomputeWarnings((rows || []).filter(r => r.id !== id), existingGuests);
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
  return (rows || [])
    .filter(r => String(r.name ?? "").trim())
    .map(r => ({ ...r, companions: (r.companions || []).slice(0, Math.max(0, (r.count || 1) - 1)) }));
}
