/**
 * The Hebrew calendar date of an event, the way an invitation prints it:
 * "כ״ה בתשרי תשפ״ז" — letters, not "25 בתשרי 5787" (WORKPLAN 137, owner
 * 4.10: "תוסיף לכל סוגי האירועים").
 *
 * Computed on the device (Intl's hebrew calendar), no service. The date is the
 * CIVIL day of the event: "YYYY-MM-DD" built from its parts as a local date —
 * never `new Date("YYYY-MM-DD")`, which is UTC midnight and lands on the day
 * before east of Greenwich (bug class 2).
 *
 * The Hebrew day begins at sunset, so an evening event is, strictly, on the
 * next Hebrew date. Invitations commonly print the daytime date; this does too.
 */

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת"];

/** A number 1–999 in Hebrew letters with geresh/gershayim: 25 → כ״ה, 15 → ט״ו. */
export function gematria(n) {
  let v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0 || v >= 1000) return "";
  let out = "";
  while (v >= 400) { out += "ת"; v -= 400; }
  if (v >= 100) { out += HUNDREDS[Math.floor(v / 100)]; v %= 100; }
  // 15 and 16 are written ט״ו and ט״ז — never יה / יו, which spell the Name.
  if (v === 15) out += "טו";
  else if (v === 16) out += "טז";
  else { out += TENS[Math.floor(v / 10)]; out += ONES[v % 10]; }
  return out.length === 1 ? `${out}׳` : `${out.slice(0, -1)}״${out.slice(-1)}`;
}

/** "YYYY-MM-DD" → "כ״ה בתשרי תשפ״ז", or "" for anything that is not a date. */
export function hebrewCalendarDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (date.getMonth() !== Number(m[2]) - 1) return "";   // 2026-02-31 and the like
  try {
    const parts = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" })
      .formatToParts(date);
    const get = (t) => parts.find(p => p.type === t)?.value;
    const day = Number(get("day"));
    const month = get("month");
    const year = Number(get("year"));
    if (!day || !month || !year) return "";
    return `${gematria(day)} ב${month} ${gematria(year % 1000)}`;
  } catch {
    return "";
  }
}
