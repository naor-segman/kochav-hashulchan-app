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

/**
 * A line that is not a guest.
 *
 * MEASURED, on 21 lines written the way people actually send them: three of
 * the failures were section headers becoming guests — "צד כלה:" and
 * "=== חברים מהצבא ===" and "סה״כ 120 איש" each landed in the list as a person.
 * Every real Israeli guest list is built out of exactly these, so a paste of
 * 200 names arrived with a handful of nonsense rows scattered through it, and
 * the host had to find them by eye.
 *
 * Kept deliberately narrow — a line only counts as noise when it CANNOT be a
 * name. Dropping a real guest is far worse than leaving a header in, and the
 * review step downstream can show a header the host disagrees with.
 */
function isNoiseLine(line) {
  const t = line.trim();
  if (!t) return true;
  // Nothing but punctuation, dashes, equals signs, dots.
  if (!/[\p{L}\d]/u.test(t)) return true;
  // A heading: ends in a colon and carries no digits ("צד כלה:", "משפחה:").
  if (/:\s*$/.test(t) && !/\d/.test(t)) return true;
  // Wrapped in decoration: "=== חברים ===", "--- צד חתן ---", "*** ***".
  if (/^[=\-*_~#•]{2,}/.test(t) && /[=\-*_~#•]{2,}\s*$/.test(t)) return true;
  // A total, not a person.
  if (/^(סה["״']?כ|סך הכל|בסך הכל|total)(?=[\s:.,-]|$)/i.test(t)) return true;
  return false;
}

/**
 * How many seats this line asks for, written the way Israelis write it.
 *
 * The "+N" form was the only one the parser knew, and it is not the common one.
 * Measured, all of these were ignored AND left their digits glued into the
 * name — "משפחת כהן 4" became a guest called "משפחת כהן 4" with one seat:
 *
 *   משפחת כהן 4          משפחת כהן - 4 אנשים        דנה כהן x2
 *   דנה כהן (2)          דנה כהן * 2                 משפחת לוי — 3 איש
 *
 * Returns { count, rest } with the notation removed, or null when the line
 * says nothing about a count. A bare trailing number is only read as a count
 * when it is small: a line ending in "1985" is a year or a house number, and
 * a line ending in a long run of digits is a phone this function never sees
 * (the phone is pulled off before we get here).
 */
const COUNT_FORMS = [
  // "x2" / "X2" / "×2" / "*2", with or without a space
  /[\sxX×*]\s*(?<!\d)(\d{1,2})\s*$/,
  // "(2)" — a bracket holding ONLY a number is a count, never a note
  /\(\s*(?<!\d)(\d{1,2})\s*\)\s*$/,
  // "- 4 אנשים" / "— 3 איש" / "4 אנשים" / "2 מקומות"
  /[-–—]?\s*(?<!\d)(\d{1,2})\s*(?:אנשים|איש|נפשות|מקומות|כיסאות)\s*$/,
  // a bare small number at the end of the line
  /\s(?<!\d)(\d{1,2})\s*$/,
];

function readCount(rest) {
  for (const re of COUNT_FORMS) {
    const m = rest.match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 2) continue;   // "1" adds nothing; 0 is not a count
    const stripped = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length);
    // Never let the count eat the whole line: "4 אנשים" with no name is not a
    // guest, and returning an empty name here would drop a row the host can
    // still see and fix.
    if (!/\p{L}/u.test(stripped)) continue;
    return { count: n, rest: stripped };
  }
  return null;
}

/**
 * "דנה + יוסי" — a plus followed by a NAME, not a number.
 *
 * The existing PLUS_RE only reads "+2". This is the same thought written the
 * other way round, and it is at least as common in a phone's notes app. The
 * name after the plus becomes a companion, which is exactly what the host
 * meant and what the printed place card needs.
 */
const PLUS_NAME_RE = /\s\+\s*([\p{L}][\p{L}\s'"״׳-]{0,40})$/u;

/**
 * One tab-separated line from a spreadsheet.
 *
 * MEASURED as completely broken: "דנה כהן ⇥ 0501234567 ⇥ 2" produced a guest
 * called "דנה כהן 2" with no phone and one seat. Tabs were being rewritten to
 * " , " before anything looked at them, which threw away the one piece of
 * structure a spreadsheet paste actually has — that each field means one
 * thing. Excel is the single most likely place a 300-name list already exists,
 * so this path is worth reading as COLUMNS rather than as prose.
 *
 * No header row is required and no column order is assumed: a field that is a
 * phone is the phone, a field that is a small bare number is the count, and
 * the longest remaining field with letters in it is the name. Anything it
 * cannot place is left for the ordinary path.
 */
function parseColumns(line) {
  const cells = line.split("\t").map(c => c.trim()).filter(Boolean);
  if (cells.length < 2) return null;

  let phone = "", count = null, nameCell = "", extra = [];
  for (const cell of cells) {
    const pm = cell.match(PHONE_RE) || cell.match(INTL_PHONE_RE) || cell.match(BARE_MOBILE_RE);
    if (!phone && pm && pm[0].trim() === cell.trim()) { phone = normalizePhone(pm[0]); continue; }
    if (count == null && /^\d{1,2}$/.test(cell)) {
      const n = parseInt(cell, 10);
      if (n >= 1 && n <= MAX_SEATS) { count = n; continue; }
    }
    if (!/\p{L}/u.test(cell)) continue;          // a stray number column
    if (cell.length > nameCell.length) { if (nameCell) extra.push(nameCell); nameCell = cell; }
    else extra.push(cell);
  }

  const name = cleanName(nameCell);
  if (!name) return null;

  const row = { name, phone };
  // A count column and a "+N" in the name cell say the same thing; take the
  // larger, the same way the names win over the number everywhere else.
  const inline = nameCell.match(PLUS_RE);
  const seats = Math.max(count || 1, inline ? 1 + parseInt(inline[1], 10) : 1);
  if (seats > 1) { row.count = Math.min(MAX_SEATS, seats); row.companions = []; }
  return row;
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
  let declared = plus ? parseInt(plus[1], 10) : null;

  // "דנה + יוסי" — the plus with a name after it rather than a number.
  let plusNames = [];
  if (declared == null) {
    const pn = rest.match(PLUS_NAME_RE);
    if (pn) {
      plusNames = splitCompanions(pn[1], null).filter(Boolean);
      if (plusNames.length) rest = rest.slice(0, pn.index) + " " + rest.slice(pn.index + pn[0].length);
    }
  }

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

  // Only look for the other count notations once the "+N" and the bracket are
  // gone, so "+1 (שרה)" is never re-read as a trailing number.
  if (declared == null && !companions.length) {
    const c = readCount(rest);
    if (c) { declared = c.count - 1; rest = c.rest; }
  }
  if (plusNames.length) companions = companions.concat(plusNames);

  const name = cleanName(rest.replace(/[,;|]+/g, " "));
  if (!name) return null;
  // A line that is only a phone number gives us nobody to seat.
  if (!/\p{L}/u.test(name)) return null;

  // The names win when they disagree with the number: "+1 (שרה, יונתן)" is
  // three seats. A "+2" with no names is three seats and no names to show.
  const count = Math.min(MAX_SEATS, 1 + Math.max(declared || 0, companions.length));
  const row = { name, phone };
  // `count` is clamped to MAX_SEATS; `companions` has to be clamped WITH it, or
  // a bracket holding 60 names produces companions.length 60 against count 50 —
  // the one shape the rest of the app treats as impossible
  // (companions.length <= count - 1). Absurd input, but every downstream reader
  // re-clamping is not the same as the gateway being right.
  if (count > 1) { row.count = count; row.companions = companions.slice(0, count - 1); }
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
    const raw = rawLine.replace(BIDI_RE, "").trim();
    if (!raw || isNoiseLine(raw)) continue;

    // A spreadsheet paste is COLUMNS. Read it as columns first; only if that
    // cannot make sense of the line do we flatten the tabs and read it as
    // prose, which is what always used to happen and is what lost the phone.
    if (raw.includes("\t")) {
      const row = parseColumns(raw);
      if (row) {
        const key = `${row.name.toLowerCase()}|${row.phone}`;
        if (!seen.has(key)) { seen.add(key); out.push(row); }
        continue;
      }
    }

    const line = raw.replace(/\t/g, " , ");

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
