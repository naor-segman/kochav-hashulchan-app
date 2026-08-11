/**
 * The guest add/edit form ⇄ guest row conversion, as pure functions.
 *
 * Why this file exists (11.8, after a real event):
 * a guest row is the only place in this product where a host types data that
 * nothing else can reproduce — a companion's name is not derivable from
 * anything. The edit form seeds itself from a SUBSET of the row and then writes
 * a row back, and that shape is one careless `Object.assign` away from erasing
 * everything it did not think to copy. It has already cost the owner eight
 * hand-typed names once (root cause was the collab RPC, not this form — but the
 * form was one line away from being the second cause).
 *
 * The rules encoded here, and pinned by guestForm.test.js:
 *   1. Merging a form into a guest starts from the STORED guest, and only the
 *      fields the form actually owns may change. Anything else — arrival, the
 *      gift recorded on the day, ids, flags a future screen adds — survives
 *      untouched, because the form never knew about it and therefore has no
 *      opinion about it.
 *   2. Companion names are only ever replaced by an ACTUAL array. A form that
 *      carries no companions array leaves the stored names alone; it does not
 *      mean "the host cleared them".
 *   3. A single companion can be changed on its own. Positions are stable, so
 *      "מלווה 2" is always the second seat.
 */

import { MEAL_DEFAULT } from "../data/constants.js";

/** The only fields the guest form is allowed to write. */
export const GUEST_FORM_FIELDS = [
  "name", "phone", "side", "group", "count", "companions", "notes",
  "estGift", "rsvp", "meal",
];

const str = (v) => (v == null ? "" : String(v));

/** Seats this row occupies. Always ≥ 1 — a guest that takes no seat is not a guest. */
export const seatCount = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(50, n) : 1;
};

/** How many companion slots a row of `count` seats has. */
export const companionSlots = (count) => Math.max(0, seatCount(count) - 1);

/**
 * Companion names sized for `count` seats, for RENDERING the inputs: clamped to
 * the number of extra seats and padded with "" so every seat gets a box.
 */
export function companionsForCount(companions, count) {
  const slots = companionSlots(count);
  const src = Array.isArray(companions) ? companions : [];
  return Array.from({ length: slots }, (_, i) => str(src[i]));
}

/**
 * Change ONE companion name and leave every other position exactly as it was.
 * This is the operation the owner asked for: "אם אני רוצה לשנות מלווה אחד אני
 * צריך להקליד שוב את כל השאר" — no longer true.
 */
export function setCompanionAt(companions, index, value) {
  const next = Array.isArray(companions) ? companions.slice() : [];
  while (next.length <= index) next.push("");
  next[index] = str(value);
  return next;
}

/**
 * Companion names as they should be STORED: trimmed, clamped to the extra
 * seats, trailing blanks dropped (so a half-filled list doesn't carry empty
 * tail entries) but inner blanks kept, because position is meaning.
 */
export function normalizeCompanions(companions, count) {
  if (!Array.isArray(companions)) return null;      // "no opinion" — caller keeps stored
  const out = companions.slice(0, companionSlots(count)).map((c) => str(c).trim());
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** "" / null / gibberish → undefined; otherwise a non-negative integer. */
export function moneyOrUndefined(v) {
  if (v === "" || v == null) return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : Math.max(0, n);
}

/** A blank form for adding a guest. */
export function emptyGuestForm(defaultGroup, side = "bride") {
  return {
    name: "", phone: "", side, group: defaultGroup, count: 1,
    companions: [], notes: "", estGift: "",
    rsvp: "pending", meal: MEAL_DEFAULT,
  };
}

/**
 * Seed the form from a stored guest. Every field the form can edit is loaded —
 * a field the form renders but does not load is a field the host is invited to
 * overwrite with a blank.
 */
export function guestToForm(guest, defaultGroup) {
  const g = guest || {};
  const count = seatCount(g.count);
  return {
    name:   str(g.name),
    phone:  str(g.phone),
    side:   g.side === "groom" ? "groom" : "bride",
    group:  str(g.group) || defaultGroup,
    count,
    // Loaded in full, and padded to the seat count so all eight boxes appear
    // with all eight names already in them.
    companions: companionsForCount(g.companions, count),
    notes:  str(g.notes),
    estGift: g.estGift == null || g.estGift === "" ? "" : String(g.estGift),
    rsvp:   g.rsvp || "pending",
    meal:   g.meal || MEAL_DEFAULT,
  };
}

/**
 * Merge a form back into a stored guest.
 *
 * Starts from the guest — NOT from the form — so any field the form does not
 * own (arrival, the gift recorded at the door, anything a future screen adds)
 * comes through untouched. `group` is passed separately because the screen
 * resolves "אחר" into a real custom group name before saving.
 */
export function applyGuestForm(guest, form, group) {
  const base = { ...(guest || {}) };
  const f = form || {};
  const count = seatCount(f.count);

  base.name  = str(f.name).trim();
  base.phone = str(f.phone);
  base.side  = f.side === "groom" ? "groom" : "bride";
  base.group = str(group ?? f.group);
  base.count = count;
  base.notes = str(f.notes);
  base.rsvp  = f.rsvp || "pending";
  base.meal  = f.meal || MEAL_DEFAULT;
  base.estGift = moneyOrUndefined(f.estGift);

  // Rule 2: only an actual array is an instruction. Anything else leaves the
  // stored names alone.
  const comps = normalizeCompanions(f.companions, count);
  if (comps) base.companions = comps;
  else if (Array.isArray(base.companions)) {
    base.companions = base.companions.slice(0, companionSlots(count));
  }

  return base;
}

/** A brand-new guest row from the form. Same rules, plus the id. */
export function newGuestFromForm(form, id, group) {
  return applyGuestForm({ id }, form, group);
}
