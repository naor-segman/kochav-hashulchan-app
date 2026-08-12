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
 *   דוד לוי 501234567            (Excel ate the leading zero)
 *   דוד לוי+1 (שרה לוי)          (a guest row is a GROUP — see below)
 *   דוד לוי +2 (שרה, יונתן)
 *   משפחת לוי (דוד ושרה)
 *   דוד לוי 0501234567 שרה כהן 0521234567   (two people on one line)
 *
 * A row is a GROUP, not a person: `count` is how many SEATS it takes and
 * `companions` holds the names of everyone in it except the main guest — the
 * exact shape guestSeatNames() in eventHelpers.js expands for name tags. Both
 * fields are OMITTED from a row that declared no companions, so a plain
 * "דוד לוי" line still produces exactly `{ name, phone }` and nothing
 * downstream has to learn a new shape for the common case.
 */

// Bidi control marks. Copying an RTL line out of WhatsApp or a spreadsheet
// carries LRM/RLM/isolates that sit INVISIBLY between the name and the "+1",
// so every pattern below missed by one character with nothing on screen to
// explain why.
const BIDI_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// Israeli mobile/landline, with or without +972, spaces, dashes or brackets.
// Israeli mobile/landline with any mix of spaces, dashes and brackets, plus
// the 00972 / +972 international forms. Separators are allowed between every
// group because real pasted lists use all of them ("050-123-45-67").
//
// The digit boundaries are load-bearing. Without them "05012345678" — one digit
// too many, i.e. a typo — matched its first ten digits: the guest got SOMEONE
// ELSE'S number stored as fact, and the leftover "8" was appended to their name.
// A number that is not exactly a phone number now matches nothing and stays
// visible in the name, where the host can see it and fix it.
//
// The `\(?0?\)?` is the redundant trunk zero in "+972 (0)52-123-4567" — how an
// Israeli writes their own number on a business card, and what a contacts
// export produces. normalizePhone has handled that form for a long time and has
// its own test for it; the parser never actually fed it one, so the line landed
// with the digits still in the guest's name.
const PHONE_RE = /(?<!\d)(?:(?:\+|00)?972[-.\s]?\(?0?\)?[-.\s]?|0)\(?(?:[23489]|5\d|7\d)\)?(?:[-.\s]?\d){7}(?!\d)/;

// Excel treats a phone column as a number and eats the leading zero, so half
// the lists people paste carry "501234567" instead of "0501234567". Nine digits
// opening with a mobile prefix (05x / 07x without its zero) is unambiguous;
// nothing else is accepted without the zero — see the rejects in the test file.
const BARE_MOBILE_RE = /(?<!\d)[57]\d(?:[-.\s]?\d){7}(?!\d)/;

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
  // "+972 (0)52-123-4567" is how Israelis write their own number on a business
  // card, and it is what a contacts export produces. The country code is
  // followed by a REDUNDANT trunk zero, so stripping only "972" left "0" +
  // "0521234567" = "00521234567" — stored on the guest, printed in the list and
  // written into the Excel export.
  if (digits.startsWith("9720")) return "0" + digits.slice(4);
  if (digits.startsWith("972"))  return "0" + digits.slice(3);
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

// "+1", "+ 2", "עמיר+1" — the plus is glued to the name as often as not.
// The (?!\d) is what keeps it away from a phone: "+972…" must NOT read as
// "+97 companions", and a bare "+9" followed by more digits is never a count.
const PLUS_RE = /\+\s*(\d{1,2})(?!\d)/;

// A guest row can hold at most this many seats — the same ceiling seatCount()
// in guestForm.js enforces, so a typo'd "+99" cannot create a row the edit
// form then silently clamps to something else.
const MAX_SEATS = 50;

/**
 * Split the names inside "(…)" into people.
 *
 * `expected` is the count declared by a "+N" when there was one. If the commas
 * alone already produced that many names we stop there and never touch the
 * spaces — "+1 (יובל סגמן)" is ONE companion with a surname, not two people.
 */
function splitCompanions(raw, expected) {
  const parts = String(raw || "")
    .split(/\s*[,;/|•]\s*/).map(s => s.trim()).filter(Boolean);
  if (expected != null && parts.length >= expected) return parts;
  return parts.flatMap(splitOnVav);
}

/**
 * "דני ורונית" is two people. Hebrew glues the conjunction onto the next word,
 * so the only signal is a following word that starts with ו.
 *
 * Known and accepted false positive: "(רונית ורד)" reads as רונית + רד, because
 * at the level of the string it is identical to "(דני ורונית)". Written the
 * ordinary way — "(רונית וורד)" or "(רונית, ורד)" — both come out right. The
 * alternative rule (demand three letters after the ו) breaks "(אבי ודן)", and
 * losing a real seat is worse than a name the host can see and correct.
 */
function splitOnVav(part) {
  const words = part.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const rest = words[i].startsWith("ו") ? words[i].slice(1) : "";
    if (rest.length < 2) continue;
    return [words.slice(0, i).join(" "), [rest, ...words.slice(i + 1)].join(" ")];
  }
  return [part];
}

/** Every phone on the line, Israeli forms only, in order. */
const PHONE_G = new RegExp(`${PHONE_RE.source}|${BARE_MOBILE_RE.source}`, "g");

/**
 * One line, two people: "עמיר סגמן 0501234567 יובל סגמן 0521111111".
 *
 * It used to collapse into a single guest called
 * "עמיר סגמן יובל סגמן 0521111111" — one person invented, one person lost, and
 * a phone number printed as part of a name. Rejecting the line instead would
 * lose both of them just as silently, and the data is not actually ambiguous:
 * two complete Israeli numbers with a name beside each is two guests. So we
 * split. The cut goes AFTER each number when the line opens with a name, and
 * BEFORE each number when it opens with a number — those are the two layouts a
 * copied column produces. Anything more tangled falls through as one row, which
 * is no worse than before.
 */
function splitPeople(line) {
  const ms = [...line.matchAll(PHONE_G)];
  if (ms.length < 2) return [line];

  const nameFirst = /\p{L}/u.test(line.slice(0, ms[0].index));
  const cuts = nameFirst
    ? ms.slice(0, -1).map(m => m.index + m[0].length)
    : ms.slice(1).map(m => m.index);

  const segs = [];
  let prev = 0;
  for (const c of cuts) { segs.push(line.slice(prev, c)); prev = c; }
  segs.push(line.slice(prev));
  return segs.filter(s => s.trim());
}

/** One person / group. Returns null when there is nobody to seat. */
function parseOnePerson(segment) {
  // Israeli form first — it is the common case and the more specific pattern.
  // Only if that misses do we look for a foreign number, and only then for a
  // local number whose leading zero was eaten by a spreadsheet.
  const m = segment.match(PHONE_RE) || segment.match(INTL_PHONE_RE) || segment.match(BARE_MOBILE_RE);
  const phone = m ? normalizePhone(m[0]) : "";
  // The phone comes out FIRST, before the "+N" is read: "+1 212 555 1234" is a
  // foreign number, and reading its "+1" as a companion count would both invent
  // a seat and destroy the number.
  let rest = m ? segment.replace(m[0], " ") : segment;

  const plus = rest.match(PLUS_RE);
  if (plus) rest = rest.replace(plus[0], " ");
  const declared = plus ? parseInt(plus[1], 10) : null;

  // The LAST "(…)" on the line — "דוד (מהעבודה) +1 (שרה)" means שרה.
  const parens = [...rest.matchAll(/\(([^)]*)\)/g)];
  const paren  = parens.length ? parens[parens.length - 1] : null;
  let companions = paren ? splitCompanions(paren[1], declared) : [];

  // With no "+N" to say otherwise, a single-item bracket is a NOTE, not a
  // person: "דוד לוי (החבר מהעבודה)" is one guest. Only a bracket that clearly
  // lists more than one name is read as companions.
  // Cut by INDEX, not by String.replace: replace() would delete the FIRST
  // bracket with that text while `paren` is the LAST one, which on a repeated
  // bracket removes the wrong half of the line.
  const usesParen = paren && (declared != null || companions.length >= 2);
  if (usesParen) rest = rest.slice(0, paren.index) + " " + rest.slice(paren.index + paren[0].length);
  else companions = [];

  const name = cleanName(rest.replace(/[,;|]+/g, " "));
  if (!name) return null;
  // A line that is only a phone number gives us nobody to seat.
  if (!/\p{L}/u.test(name)) return null;

  // The names win when they disagree with the number: "+1 (שרה, יונתן)" is
  // three seats. A "+2" with no names is three seats and no names to show.
  const count = Math.min(MAX_SEATS, 1 + Math.max(declared || 0, companions.length));
  const row = { name, phone };
  if (count > 1) { row.count = count; row.companions = companions; }
  return row;
}

/**
 * @returns {{name: string, phone: string, count?: number, companions?: string[]}[]}
 *   one entry per group. `count` / `companions` appear only when the line
 *   declared companions, so an ordinary line is still exactly `{name, phone}`.
 */
export function parseGuestList(text) {
  const out  = [];
  const seen = new Set();

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    // Tabs and multiple spaces are column separators from spreadsheets.
    const line = rawLine.replace(BIDI_RE, "").replace(/\t/g, " , ").trim();
    if (!line) continue;

    for (const segment of splitPeople(line)) {
      const row = parseOnePerson(segment);
      if (!row) continue;

      // Same person pasted twice collapses — but the key is name+phone, not one
      // or the other: spouses share a household line, and keying on phone alone
      // silently dropped the second of them.
      const key = `${row.name.toLowerCase()}|${row.phone}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push(row);
    }
  }

  return out;
}

/** Seats the paste will actually take — a "+1" row is two of them. */
export function countSeats(rows) {
  return (rows || []).reduce((n, r) => n + (r.count || 1), 0);
}

/** How many of the parsed rows came with a phone — shown before importing. */
export function countWithPhone(rows) {
  return (rows || []).filter(r => r.phone).length;
}
