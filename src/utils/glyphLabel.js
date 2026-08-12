/**
 * What a table is called INSIDE a 76px glyph on the room map.
 *
 * THE BUG THIS EXISTS FOR
 * VenueCanvas handed `TableGlyph` the table's full name. The glyph draws its
 * label as an SVG `<text>` at a fixed 28 user units, centred, with nothing to
 * stop it — and the map scales ~1.63x to fill its card. Measured at 1280px on
 * an eight-table event:
 *
 *   שולחן הורי הכלה   → 280.9px of text in a 127px box, 77px out of EACH side
 *                        → overlapped שולחן החברים מהצבא by 158.3 x 41.8 px
 *                        → which overlapped שולחן 3 by 85.1 x 41.8 px
 *   שולחן 4            → 134.4px in the same 127px box
 *
 * On screen the two named tables read as "ון הורי" and "זחברים". Even the plain
 * numbered ones were over. `שולחן הורי הכלה` is the same name that forced the
 * printed table card to be re-tiered — it was fixed on paper and left broken on
 * the map.
 *
 * THE ANSWER
 * A room map identifies a table the way a real floor plan does: by its number.
 * The full name belongs in the accessible name and the tooltip, where it can be
 * as long as the host likes. So:
 *
 *   "שולחן 7"          → "7"      the ordinary case, and the one that matters
 *   "Table 12"         → "12"
 *   "7"                → "7"
 *   "שולחן הורי הכלה"  → "הורי"   first meaningful word, capped
 *   ""                 → the 1-based position, so a nameless table still has
 *                        something to point at
 *
 * `glyphFontSize` is the second half: whatever survives the shortening still
 * has to FIT, and a four-letter Hebrew word at 28 units does not.
 */

/** The word almost every Hebrew table name starts with — it distinguishes nothing. */
const GENERIC = ["שולחן", "table", "Table", "שולחנות"];

/** How wide the label may be, in the glyph's user units. The viewBox is 100 and
 *  the round table's radius is 31, so 62 units is the inner diameter; 58 leaves
 *  a little air at the sides. */
const MAX_WIDTH = 58;

/** The glyph's designed label size — what a one or two character label gets. */
const BASE_SIZE = 28;

/**
 * Width per character, per unit of font size. MEASURED with getBBox in the
 * glyph's own user space, not estimated — my first guess was derived from the
 * on-screen pixel widths and was wrong about the viewBox:
 *
 *   "7" / "12"  0.556      digits are the narrow case
 *   "הורי"      0.464
 *   "שולחן"     0.532
 *   "אבגדה"     0.606      the widest Hebrew letters
 *
 * 0.62 is deliberately past the worst measured case. At 0.58 the label
 * "החברי" came out 57.88 units against a 58-unit budget — inside, but with no
 * room for a letter combination wider than the ones I happened to test.
 */
const CHAR_RATIO = 0.62;

/** Longest label worth shrinking for. Past this, shortening beats scaling. */
const MAX_CHARS = 5;

/**
 * A short, distinctive label for a table glyph.
 *
 * @param {string} name  the table's full name, as the host typed it
 * @param {number} index 0-based position, used only when there is nothing else
 * @returns {string}
 */
export function glyphLabel(name, index = 0) {
  const s = String(name ?? "").trim();
  if (!s) return String(index + 1);

  // A trailing number is the table's identity on a map. "שולחן 7" and
  // "שולחן מספר 7" both come back as "7".
  const num = s.match(/(\d+)\s*$/);
  if (num) return num[1];

  // No number: use the first word that actually says something.
  const words = s.split(/\s+/).filter(w => w && !GENERIC.includes(w));
  const word  = words[0] || s;
  return word.length <= MAX_CHARS ? word : word.slice(0, MAX_CHARS);
}

/**
 * The font size, in the glyph's user units, at which `label` fits.
 *
 * Never larger than the designed 28 — a short label must look exactly as it
 * always has, or every screen that already uses this glyph changes.
 *
 * @param {string} label the ALREADY-shortened label
 * @returns {number} font size in user units
 */
export function glyphFontSize(label) {
  const len = String(label ?? "").length;
  if (len <= 2) return BASE_SIZE;
  return Math.min(BASE_SIZE, Math.round((MAX_WIDTH / (len * CHAR_RATIO)) * 10) / 10);
}
