/**
 * "Add to calendar" as a downloadable .ics file.
 *
 * Deliberately a file rather than a Google/Outlook deep link: an .ics opens in
 * whatever calendar the guest actually uses — iOS, Android, Outlook, Google —
 * with no account, no OAuth and no third-party redirect. One implementation
 * covers every device, which is the opposite of what per-vendor links give you.
 */

/** Escape per RFC 5545: commas, semicolons and backslashes are separators. */
function esc(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** The current instant as a UTC iCalendar timestamp. */
function utcStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** YYYYMMDD from an ISO date, or null when unusable. */
function toStamp(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return isoDate.replace(/-/g, "");
}

/** "H:MM" → "HH:MM", the hour clamped to 23 (a "25:00" typo is still the
 *  evening, not an invalid DATE-TIME that makes the calendar refuse the file);
 *  null when it is not a time at all. */
function normTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m || Number(m[2]) > 59) return null;
  return `${String(Math.min(23, Number(m[1]))).padStart(2, "0")}:${m[2]}`;
}

/** An instant (epoch ms) as an iCalendar UTC DATE-TIME: 20261001T180000Z. */
function utcDateTime(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** When nothing in the schedule says otherwise. One value for every consumer. */
export const DEFAULT_START = "19:00";

/**
 * The event's start time, as the guest pages use it: the first schedule entry
 * with a valid "H:MM", else DEFAULT_START. There is no start-time field on the
 * event; the schedule is where the host writes it.
 *
 * One helper because there were two answers: the calendar button read the
 * first schedule item (falling back to 19:00) while the site countdown was
 * hard-coded to 18:00 — so an event starting at 21:00 hit zero three hours
 * early, beside a calendar entry that said 21:00 (WORKPLAN ס, 28.9 audit).
 *
 * @param {Array<{time?: string}>} schedule
 * @returns {string} "HH:MM"
 */
export function eventStartTime(schedule) {
  return knownStartTime(schedule) ?? DEFAULT_START;
}

/**
 * The start time the schedule actually states, or null when it states none.
 *
 * The calendar file uses this, not eventStartTime: a countdown needs SOME
 * moment to count to, but a calendar entry at a confident 19:00 that nobody
 * wrote is a wrong fact in the guest's calendar (36b). With no time known the
 * file is an all-day entry instead.
 *
 * @param {Array<{time?: string}>} schedule
 * @returns {string|null} "HH:MM"
 */
export function knownStartTime(schedule) {
  for (const item of Array.isArray(schedule) ? schedule : []) {
    // String(): a non-string time (a number from an import, say) threw here,
    // and this now runs while the site page renders, for the countdown.
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(item?.time ?? "").trim());
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  return null;
}

/**
 * The moment an event starts, as epoch ms: "YYYY-MM-DD" + "HH:MM" read as
 * ISRAEL time, whatever the viewer's device is set to. The countdown used
 * `new Date(date + "T" + time)`, which is the VIEWER's time — a guest in New
 * York watched a 21:00 wedding's countdown end seven hours late (29.9 review).
 * DST-safe: the offset is looked up for the instant itself, twice, so a start
 * next to a transition settles on the right side of it. NaN if either part is
 * malformed.
 */
export function israelInstant(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  const t = /^(\d{2}):(\d{2})$/.exec(String(time ?? ""));
  if (!d || !t) return NaN;
  const wall = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const offsetAt = (ms) => {
    const p = Object.fromEntries(fmt.formatToParts(ms).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
  };
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

/** "YYYY-MM-DD" + n calendar days, by calendar arithmetic (never n×86400000,
 *  which a DST change breaks). */
function addDaysIso(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Default length: four hours — Israeli events run long, and one hour is
 *  never right. As a duration it also rolls a 23:30 start past midnight
 *  instead of clamping it into a zero-length marker. */
const DEFAULT_LENGTH_MS = 4 * 3600_000;

/**
 * Build the .ics text for an event.
 *
 * TIMES ARE UTC, WITH Z (61 / T3). They used to be written "floating" — no Z,
 * no VTIMEZONE — on the theory that 19:00 should stay 19:00 on any phone. That
 * is right for an alarm clock and wrong for an event that happens in ONE place:
 * a guest flying in from London got a 19:00 London entry for a 19:00 Tel Aviv
 * wedding, two hours late. The wall time is read as Israel time (israelInstant,
 * DST-correct) and written as the instant it is; every calendar shows it in
 * the guest's own zone.
 *
 * NO START TIME KNOWN → AN ALL-DAY ENTRY (36b). A schedule with no time used to
 * produce a confident 19:00 that nobody wrote. DTSTART;VALUE=DATE is a date
 * without a time — which is exactly what the host told us.
 *
 * @param {object} p
 * @param {string} [p.startTime]  "HH:MM" Israel time, or nothing for all-day
 * @param {string} [p.endTime]    "HH:MM" Israel time; earlier than the start = the next day
 * @returns {string|null} null when there is no usable date
 */
export function buildEventIcs({ name, date, venue, startTime, endTime, url, description }) {
  const day = toStamp(date);
  if (!day) return null;

  const start = normTime(startTime);
  let timing;
  if (!start) {
    timing = [
      `DTSTART;VALUE=DATE:${day}`,
      // DTEND of an all-day entry is EXCLUSIVE: the next day.
      `DTEND;VALUE=DATE:${addDaysIso(date, 1).replace(/-/g, "")}`,
    ];
  } else {
    const startMs = israelInstant(date, start);
    const end = normTime(endTime);
    // A host who types an end time of 01:00 for a 21:00 wedding means the small
    // hours of the NEXT day. Strictly earlier: an end EQUAL to the start used
    // to fall through `<=` into a 24-hour block in every guest's calendar.
    const endMs = end
      ? israelInstant(end < start ? addDaysIso(date, 1) : date, end)
      : startMs + DEFAULT_LENGTH_MS;
    timing = [
      `DTSTART:${utcDateTime(startMs)}`,
      // An end equal to the start would be a zero-length marker, not a block.
      `DTEND:${utcDateTime(endMs > startMs ? endMs : startMs + DEFAULT_LENGTH_MS)}`,
    ];
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Unica Plan//Event//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${day}-${Math.abs(hash(name + date))}@kochav-hashulchan`,
    // DTSTAMP must be UTC (§3.8.7.2).
    `DTSTAMP:${utcStamp()}`,
    ...timing,
    `SUMMARY:${esc(name || "אירוע")}`,
    venue       ? `LOCATION:${esc(venue)}`           : null,
    description ? `DESCRIPTION:${esc(description)}`  : null,
    url         ? `URL:${esc(url)}`                  : null,
    // A day-before reminder is what people actually want from a wedding invite.
    // An all-day entry starts at midnight, so "a day before" would alert at
    // midnight; noon the day before instead.
    "BEGIN:VALARM",
    start ? "TRIGGER:-P1D" : "TRIGGER:-PT12H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(name || "אירוע")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  // RFC 5545 wants CRLF line endings; some Windows clients are strict about it.
  // Lines are also folded at 75 OCTETS — Hebrew is 2 bytes per character in
  // UTF-8, so an ordinary venue name blew past the limit unfolded and strict
  // parsers (Outlook in particular) truncated it mid-word.
  return lines.map(foldLine).join("\r\n");
}

/**
 * Fold a content line to 75 octets per RFC 5545 §3.1, never splitting a
 * codepoint. Continuation lines start with a single space.
 */
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "", curBytes = 0, limit = 75;
  for (const ch of line) {              // iterates by codepoint, not UTF-16 unit
    const n = enc.encode(ch).length;
    if (curBytes + n > limit) {
      out.push(cur);
      cur = ch; curBytes = n;
      limit = 74;                       // continuation lines carry a leading space
    } else {
      cur += ch; curBytes += n;
    }
  }
  if (cur) out.push(cur);
  return out.join("\r\n ");
}

/** Small stable hash so the same event keeps the same UID across downloads. */
function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (h << 5) - h + String(str).charCodeAt(i);
    h |= 0;
  }
  return h;
}

/** Safe-ish file name — strips what filesystems dislike, keeps Hebrew. */
export function icsFileName(name) {
  const clean = String(name || "אירוע").replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 60);
  return (clean || "אירוע") + ".ics";
}

/** Trigger the download in the browser. */
export function downloadIcs(ics, fileName) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
