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

/** HHMM -> HHMMSS. Missing/short input falls back to a sane evening default. */
function toTime(hhmm, fallback = "190000") {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "").trim());
  if (!m) return fallback;
  const h = String(Math.min(23, Number(m[1]))).padStart(2, "0");
  return `${h}${m[2]}00`;
}

/** YYYYMMDD + n days, so an end time past midnight lands on the next day. */
function addDays(stamp, n) {
  const d = new Date(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)) + n
  );
  const p = x => String(x).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * Default end: four hours after the start — Israeli events run long, and one
 * hour is never right.
 *
 * Clamping the hour at 23 while keeping the start minutes produced a
 * ZERO-LENGTH entry for anything starting at 23:00 or later (23:30 → 23:30),
 * which calendars draw as a bare marker with no block. Past midnight the end
 * has to roll onto the next day instead.
 *
 * @returns {{ day: string, time: string }}
 */
function defaultEnd(day, start) {
  const h = Number(start.slice(0, 2)) + 4;
  const p = x => String(x).padStart(2, "0");
  return { day: h > 23 ? addDays(day, 1) : day, time: `${p(h % 24)}${start.slice(2)}` };
}

/**
 * Build the .ics text for an event.
 *
 * Times are written as local (no Z suffix, no VTIMEZONE): a wedding at 19:00
 * is at 19:00 wherever the guest's phone is set, and floating local time is
 * what every calendar app does with that correctly. Converting to UTC would
 * shift the entry for anyone whose phone is on another timezone.
 *
 * @returns {string|null} null when there is no usable date
 */
export function buildEventIcs({ name, date, venue, startTime, endTime, url, description }) {
  const day = toStamp(date);
  if (!day) return null;

  const start = toTime(startTime, "190000");
  // A host who types an end time of 01:00 for a 21:00 wedding means the small
  // hours of the NEXT day, not a negative-length event.
  const explicitEnd = /^\d{1,2}:\d{2}$/.test((endTime || "").trim())
    ? { day: toTime(endTime) <= start ? addDays(day, 1) : day, time: toTime(endTime) }
    : null;
  const end = explicitEnd || defaultEnd(day, start);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kochav Hashulchan//Event//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${day}-${Math.abs(hash(name + date))}@kochav-hashulchan`,
    // DTSTAMP must be UTC (§3.8.7.2). DTSTART/DTEND stay floating local on
    // purpose — a 19:00 wedding is 19:00 wherever the guest's phone is set.
    `DTSTAMP:${utcStamp()}`,
    `DTSTART:${day}T${start}`,
    `DTEND:${end.day}T${end.time}`,
    `SUMMARY:${esc(name || "אירוע")}`,
    venue       ? `LOCATION:${esc(venue)}`           : null,
    description ? `DESCRIPTION:${esc(description)}`  : null,
    url         ? `URL:${esc(url)}`                  : null,
    // A day-before reminder is what people actually want from a wedding invite.
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
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
