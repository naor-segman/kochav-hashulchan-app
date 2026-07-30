// ── Date / number formatting for the admin panel ──────────────────────────────
//
// One copy. AdminEventsScreen and AdminEventDetailScreen each carried their own
// `formatDate` + `formatRelative`, character for character, and both carried
// the same two bugs:
//
//   1. `Math.floor((Date.now() - t) / 86_400_000)` — fixed-millisecond day
//      arithmetic. Israel changes its clocks inside every wedding season, so
//      across a DST transition the difference is 23 or 25 hours and the count
//      is off by one. CLAUDE.md bug class 2.
//   2. Worse: "היום" / "אתמול" were derived from that elapsed-hours number, not
//      from the calendar. A row touched YESTERDAY at 23:50 is nine hours old,
//      so `days === 0`, so it read "היום".
//
// Both are fixed the way src/utils/dateFormat.js daysUntil() already does it:
// take LOCAL calendar parts off each end, rebuild them as UTC midnights, and
// subtract. UTC has no transition, so the division is exact.

/** Calendar days between two instants, by local calendar date. 0 = same day. */
export function calendarDaysAgo(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const then  = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86_400_000);
}

/** `DD.MM.YYYY`. Accepts a date-only `YYYY-MM-DD` or a full timestamp. */
export function formatDate(iso) {
  if (!iso) return "—";
  // A bare YYYY-MM-DD parses as UTC midnight and lands on the previous day
  // east of Greenwich, so it is anchored to local midnight first.
  const d = new Date(String(iso) + (String(iso).includes("T") ? "" : "T00:00:00"));
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** `DD.MM.YYYY, HH:MM`. Always render inside dir="ltr" — see formatDateTime's
 *  note in AdminActivityScreen. */
export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * "היום" · "אתמול" · "לפני 3 ימים" · "לפני שבוע" · "לפני שבועיים" · a date.
 *
 * Hebrew has a dual, and it does not say "1 weeks": the old version rendered
 * `לפני 1 שבועות` for the whole 7–13 day band, i.e. on most rows of a table
 * that is sorted by recency.
 */
export function formatRelative(iso, now = new Date()) {
  if (!iso) return "—";
  const days = calendarDaysAgo(iso, now);
  if (days === null) return String(iso);
  if (days <  0) return formatDate(iso);   // clock skew / future timestamp
  if (days === 0) return "היום";
  if (days === 1) return "אתמול";
  if (days <  7) return `לפני ${days} ימים`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    if (weeks === 1) return "לפני שבוע";
    if (weeks === 2) return "לפני שבועיים";
    return `לפני ${weeks} שבועות`;
  }
  return formatDate(iso);
}

/** Hebrew count phrase with a correct singular. `1 פעילים` was on every plan
 *  card that had exactly one subscriber. */
export function countPhrase(n, { none, one, many }) {
  if (n === 0) return none;
  if (n === 1) return one;
  return many.replace("%n", n.toLocaleString());
}
