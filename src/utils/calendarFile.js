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
  // Israeli events run long; four hours is a truer default than one.
  const end   = toTime(endTime, String(Math.min(23, Number(start.slice(0, 2)) + 4)).padStart(2, "0") + start.slice(2));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kochav Hashulchan//Event//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${day}-${Math.abs(hash(name + date))}@kochav-hashulchan`,
    `DTSTAMP:${day}T${start}`,
    `DTSTART:${day}T${start}`,
    `DTEND:${day}T${end}`,
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
  return lines.join("\r\n");
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
