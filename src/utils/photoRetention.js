// ── When an event's photos go away ───────────────────────────────────────────
//
// Photos are the only part of an event with real weight. Measured
// (qa/storageSize.mjs, qa/webpGain.mjs): the event itself is ~0.10MB, its
// photos are ~3.8MB, and a 300-guest event delivers ~0.94GB to guests. An
// account that runs events forever accumulates that forever, and none of it is
// looked at again a month after the party.
//
// So they expire. THE EVENT DOES NOT — the guest list, the seating, the
// arrivals, the costs all stay. Only the bytes that cost money go.
//
// The whole schedule is a pure function of the event's date, which is what
// makes it testable and what lets the server compute the identical answer in
// SQL without sharing code with this file.
//
// DATES ARE THE BUG CLASS THIS FILE IS MOST EXPOSED TO. Three ways to get it
// wrong, all of which have shipped in this repo before:
//
//   `new Date("2026-06-01")` parses as UTC MIDNIGHT, which is 03:00 local in
//   Israel — so the local calendar day is right, but the same expression at a
//   negative offset lands on May 31. It is not used here; the string is split
//   into parts.
//
//   `days * 86400000` breaks across a DST transition: Israel moves the clock in
//   late March and late October, so a 30-day span that crosses one is 30 days
//   ± an hour, and an event dated the 1st can expire on the 30th. All the
//   arithmetic below is CALENDAR arithmetic — `new Date(y, m - 1, d + 30)` —
//   which the platform normalises over month ends and DST alike.
//
//   `toISOString()` on a local-midnight Date yields the PREVIOUS day east of
//   Greenwich. Nothing here formats through it.
// ─────────────────────────────────────────────────────────────────────────────

/** Days after the event date at which the photos are deleted. */
export const PURGE_AFTER_DAYS = 30;

/** How long before that the host is told. */
export const WARN_BEFORE_DAYS = 7;

/**
 * A "YYYY-MM-DD" string as a LOCAL midnight Date, or null.
 *
 * Split rather than parsed: the Date constructor treats a bare ISO date as UTC,
 * and every comparison here is against a local "today".
 */
export function parseEventDate(ymd) {
  if (typeof ymd !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  // Rejects 2026-02-30, which the constructor would happily roll to March 2.
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) {
    return null;
  }
  return dt;
}

/** Local midnight, `days` calendar days after `date`. */
export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Local midnight today — the ground every comparison is made against. */
export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whole calendar days from `a` to `b`, both taken at local midnight. */
export function daysBetween(a, b) {
  // Round, not floor: the operands are local midnights, so the difference is a
  // whole number of days ± one hour across a DST boundary. Flooring turns
  // 29.958 into 29 and the countdown skips a day twice a year.
  return Math.round((b - a) / 86400000);
}

/**
 * Every stored-photo URL an event holds, deduplicated.
 *
 * One list, so the thing that deletes and the thing that counts can never
 * disagree about what "the event's photos" means. Legacy base64 photos are
 * excluded on purpose — they are not objects, there is nothing to delete, and
 * they cost nothing beyond the row they already sit in.
 */
export function eventPhotoUrls(ev) {
  const out = [];
  const push = (v) => {
    if (typeof v === "string" && v.length > 0 && !v.startsWith("data:")) out.push(v);
  };

  const site = ev?.eventSite;
  if (site) {
    push(site.coverPhoto);
    if (Array.isArray(site.gallery)) site.gallery.forEach(push);
  }
  // The invitation photo lives under announcements, keyed by kind. Missing it
  // would leave the single largest object per event (1400px, q0.82) behind
  // while reporting the event as purged.
  const ann = ev?.announcements;
  if (ann && typeof ann === "object") {
    for (const k of Object.keys(ann)) push(ann[k]?.photo);
  }

  return [...new Set(out)];
}

/**
 * Where this event stands, as of `now`.
 *
 *   "none"     — nothing stored; there is nothing to warn about or delete.
 *   "kept"     — the host postponed, and the postponement has not lapsed.
 *   "safe"     — more than WARN_BEFORE_DAYS to go.
 *   "warning"  — inside the warning window. `daysLeft` is what to show.
 *   "due"      — the deletion date has arrived.
 *
 * An event with no date at all is "safe" forever: the schedule is defined by
 * the event date, and guessing one would delete a real host's photos on the
 * strength of a field they never filled in.
 */
export function photoRetentionState(ev, now = new Date()) {
  const photos = eventPhotoUrls(ev);
  if (photos.length === 0) return { state: "none", photos, daysLeft: null, purgeOn: null };

  const eventDay = parseEventDate(ev?.date);
  if (!eventDay) return { state: "safe", photos, daysLeft: null, purgeOn: null };

  const today   = startOfToday(now);
  const purgeOn = addDays(eventDay, PURGE_AFTER_DAYS);

  // A postponement outranks the schedule while it lasts. Stored as a
  // "YYYY-MM-DD" so it survives the cloud round-trip as plain JSON and reads
  // the same in SQL, where the server enforces it.
  const keep = parseEventDate(ev?.eventSite?.photosKeepUntil);
  if (keep && today < keep) {
    return { state: "kept", photos, daysLeft: daysBetween(today, keep), purgeOn: keep };
  }

  const daysLeft = daysBetween(today, purgeOn);
  if (daysLeft <= 0)                return { state: "due",     photos, daysLeft: 0, purgeOn };
  if (daysLeft <= WARN_BEFORE_DAYS) return { state: "warning", photos, daysLeft, purgeOn };
  return { state: "safe", photos, daysLeft, purgeOn };
}

/**
 * The date a "keep them longer" click should postpone to: another full
 * retention window from today, not from the event.
 *
 * Returned as "YYYY-MM-DD" built from LOCAL parts. `toISOString().slice(0,10)`
 * would be the previous day for every Israeli host, which is the same
 * off-by-one-day bug this codebase has shipped before.
 */
export function postponeToYmd(now = new Date()) {
  const d = addDays(startOfToday(now), PURGE_AFTER_DAYS);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
