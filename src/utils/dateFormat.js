// V1 date formatting — extracted from Dashboard in legacy/v1-seating-app.jsx

const MONTHS = ["","ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

export const fmtDate = d => {
  if (!d) return null;
  const [y, m, day] = String(d).split("-");
  const month = MONTHS[Number(m)];
  // Malformed input (missing/NaN parts) → return the raw string instead of
  // "NaN בundefined ...".
  if (!day || !month || Number.isNaN(Number(day))) return String(d);
  return Number(day) + " ב" + month + " " + y;
};

/**
 * Whole calendar days from today to an ISO `YYYY-MM-DD` date.
 * Negative in the past, 0 today, positive ahead.
 *
 * Both ends are normalised to UTC midnight before subtracting. That matters:
 * this codebase has already shipped `diff / 86400000` on local timestamps, and
 * Israel changes its clocks inside every wedding season — an event 47 days out
 * reads 46 or 48 across the transition. In UTC there is no transition, so the
 * division is exact.
 *
 * `new Date("YYYY-MM-DD")` is not used either: it parses as UTC midnight and
 * lands on the previous day east of Greenwich.
 */
export const daysUntil = (iso, today = new Date()) => {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(target)) return null;
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86400000);
};
