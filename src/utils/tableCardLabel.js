/**
 * What goes big on the printed table card, and how big it is allowed to be.
 *
 * ── bigLabel ────────────────────────────────────────────────────────────────
 * The thing a guest scans the room for. Most tables are called "שולחן 12", and
 * on a card read from four metres the word is noise — the digits are the whole
 * message. A table with a real name ("שולחן הורי הכלה") keeps its name, because
 * for that one the name IS the number.
 *
 * ── bigLabelTier ────────────────────────────────────────────────────────────
 * One fixed size cannot serve both. The card printed the label at a hardcoded
 * 46mm with no fallback, and MEASURED at A4 in print media that is:
 *
 *     "12"              →  235 × 174 px, and the face's content ran 103px past
 *                          a 184px box, so the guests' names printed 13px below
 *                          the card and were cut off by `overflow: hidden`.
 *     "שולחן הורי הכלה"  →  616 × 522 px — three wrapped lines of 174px letters
 *                          in a 184px box, 426px of overflow. What reached the
 *                          paper was a fragment of one giant word and no names.
 *
 * So the size is a function of how much there is to set. The tiers are
 * character counts because that is what drives the width, and they are returned
 * as a NAME rather than a number so the millimetres stay in the stylesheet with
 * the rest of the print geometry.
 *
 * Measured against the real A4 face (163mm of usable width): "xl" holds 2
 * characters, "lg" 4, "md" 8, and "sm" is what a full Hebrew table name needs
 * to stay on one line and leave the names room to print.
 */

/** The digits at the end of a table name, or the whole name when it has none. */
export function bigLabel(table) {
  const name = String(table?.name ?? "").trim();
  const m = name.match(/(\d+)\s*$/);
  return m ? m[1] : name || "—";
}

/**
 * @param {string} label  the output of bigLabel()
 * @returns {"xl"|"lg"|"md"|"sm"} the size class the card should set it in.
 */
export function bigLabelTier(label) {
  // Array spread counts code POINTS, so an emoji or a surrogate pair in a
  // host's table name counts as the one wide glyph it renders as, not as two.
  const n = [...String(label ?? "").trim()].length;
  if (n <= 2) return "xl";
  if (n <= 4) return "lg";
  if (n <= 8) return "md";
  return "sm";
}
