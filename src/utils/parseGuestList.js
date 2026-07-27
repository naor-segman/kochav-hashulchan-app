/**
 * Parse a pasted guest list.
 *
 * The list people actually have is a WhatsApp contact export, a copied phone
 * list, or a column pasted out of a spreadsheet — all of which carry a phone
 * number next to the name. Typing hundreds of phone numbers by hand afterwards
 * is the part hosts give up on, so the parser reads them when they are there
 * and quietly ignores the format they arrived in.
 *
 * Understood per line:
 *   דוד לוי
 *   דוד לוי, 050-1234567
 *   דוד לוי - 0501234567
 *   דוד לוי	+972 50 123 4567     (tab separated, i.e. a spreadsheet column)
 *   0501234567 דוד לוי           (phone first)
 *   ~דוד לוי                     (WhatsApp export prefixes unsaved contacts)
 */

// Israeli mobile/landline, with or without +972, spaces, dashes or brackets.
const PHONE_RE = /(?:\+?972[-\s]?|0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}/;

/** Normalise to the local 0XXXXXXXXX form the rest of the app uses. */
export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  if (digits.startsWith("0"))   return digits;
  // A bare 9-digit number is a local one missing its leading zero.
  return digits.length === 9 ? "0" + digits : digits;
}

/** Strip decoration the source added rather than the person's actual name. */
function cleanName(s) {
  return String(s || "")
    .replace(/^[~•\-–—*·\d.)\s]+/, "")   // WhatsApp "~", bullets, "1." numbering
    // Removing the phone leaves its separator behind ("שרה כהן -"), so trailing
    // punctuation has to go too — otherwise it lands in the guest's name.
    .replace(/[\s\-–—:;,.|]+$/, "")
    .replace(/["“”']/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * @returns {{name: string, phone: string}[]} one entry per usable line
 */
export function parseGuestList(text) {
  const out  = [];
  const seen = new Set();

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    // Tabs and multiple spaces are column separators from spreadsheets.
    const line = rawLine.replace(/\t/g, " , ").trim();
    if (!line) continue;

    const m = line.match(PHONE_RE);
    const phone = m ? normalizePhone(m[0]) : "";

    // Whatever is left once the phone and its separator are removed is the name.
    const name = cleanName(
      (m ? line.replace(m[0], " ") : line).replace(/[,;|]+/g, " ")
    );

    if (!name) continue;
    // A line that is only a phone number gives us nobody to seat.
    if (!/\p{L}/u.test(name)) continue;

    // Same person pasted twice (common when merging two lists) collapses.
    const key = (phone || name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ name, phone });
  }

  return out;
}

/** How many of the parsed rows came with a phone — shown before importing. */
export function countWithPhone(rows) {
  return (rows || []).filter(r => r.phone).length;
}
