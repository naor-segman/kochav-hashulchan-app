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
// Israeli mobile/landline with any mix of spaces, dashes and brackets, plus
// the 00972 / +972 international forms. Separators are allowed between every
// group because real pasted lists use all of them ("050-123-45-67").
const PHONE_RE = /(?:(?:\+|00)?972[-.\s]?|0)\(?(?:[23489]|5\d|7\d)\)?(?:[-.\s]?\d){7}/;

// Relatives abroad are normal at an Israeli wedding. The Israeli pattern above
// never matched their numbers, so the digits stayed glued into the guest's NAME
// — printed that way on the name tag and the entrance list, and unreachable
// from the messages screen. normalizePhone already handles these correctly.
const INTL_PHONE_RE = /(?:\+|00)\d{1,3}(?:[-.\s]?\d){6,12}/;

/** Normalise to the local 0XXXXXXXXX form the rest of the app uses. */
export function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // Strip the international dialling prefix FIRST — "00972…" starts with "0"
  // and used to be returned untouched, producing wa.me/9720972…
  digits = digits.replace(/^00/, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  if (digits.startsWith("0"))   return digits;
  // A bare 9-digit number is a local one missing its leading zero.
  return digits.length === 9 ? "0" + digits : digits;
}

/** Strip decoration the source added rather than the person's actual name. */
function cleanName(s) {
  return String(s || "")
    // Strip WhatsApp's "~", bullets and "1." numbering — but only a SHORT run
    // of digits, so an unmatched phone number is left visible in the name
    // rather than silently deleted.
    .replace(/^[~•*·\s]+/, "")
    .replace(/^\d{1,2}[.)]\s*/, "")
    .replace(/^[-–—\s]+/, "")
    // Removing the phone leaves its separator behind ("שרה כהן -"), so trailing
    // punctuation has to go too — otherwise it lands in the guest's name.
    .replace(/[\s\-–—:;,.|]+$/, "")
    // Only straight/curly double quotes. A geresh is part of the name in
    // ג'ורג' and צ'רלי — stripping ' turned those into גורג and צרלי.
    // Only a quote that is NOT sitting between two Hebrew letters. The blanket
    // strip turned ד"ר into דר and עו"ד into עוד ("more"), which then printed
    // on the name tag — the same mistake the geresh comment above describes.
    .replace(/(?<![\u0590-\u05FF])["“”](?![\u0590-\u05FF])/g, "")
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

    // Israeli form first — it is the common case and the more specific pattern.
    // Only if that misses do we look for a foreign number.
    const m = line.match(PHONE_RE) || line.match(INTL_PHONE_RE);
    const phone = m ? normalizePhone(m[0]) : "";

    // Whatever is left once the phone and its separator are removed is the name.
    const name = cleanName(
      (m ? line.replace(m[0], " ") : line).replace(/[,;|]+/g, " ")
    );

    if (!name) continue;
    // A line that is only a phone number gives us nobody to seat.
    if (!/\p{L}/u.test(name)) continue;

    // Same person pasted twice collapses — but the key is name+phone, not one
    // or the other: spouses share a household line, and keying on phone alone
    // silently dropped the second of them.
    const key = `${name.toLowerCase()}|${phone}`;
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
