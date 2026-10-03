/**
 * Which names go on a printed table card, and at what size (סב35b).
 *
 * The names block on a tent face has a fixed box — 57mm of face, 28mm of it
 * the table number — and clipped itself when a table held more names than the
 * box: measured on the real page in print media at A4, a table of 16 lost its
 * last line, a table of 30 lost three. The guest who reads the card to check
 * they are at the right table was exactly the one cut off, and nothing on the
 * paper said a name was missing.
 *
 * So the list is fitted before it is printed, by characters — that is what
 * fills a line:
 *   "lg"  4.2mm (the original size) while the list fits it;
 *   "sm"  3.6mm (10.2pt, still above the 10pt floor for reading standing up)
 *         and a tighter line, which buys a fourth line;
 *   and past that, the names that fit and "ועוד N" — so the card says that
 *   names are missing instead of losing them silently.
 *
 * The budgets are measured, not computed: qa harness (scratchpad nt.mjs,
 * 30.9/1.10) printed tables of 8–30 names at A4 and found the line capacity.
 * They are deliberately below the measured limit, because a line breaks at a
 * name, not at a character.
 */
export const TENT_NAMES_BUDGET = { lg: 160, sm: 240 };
const SEP = " · ";

const textLength = (names) =>
  names.reduce((s, n) => s + [...n].length, 0) + Math.max(0, names.length - 1) * SEP.length;

/**
 * @param {string[]} names  every seat's name, already in print order
 * @returns {{ shown: string[], more: number, size: "lg"|"sm" }}
 */
export function fitTentNames(names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (textLength(list) <= TENT_NAMES_BUDGET.lg) return { shown: list, more: 0, size: "lg" };
  if (textLength(list) <= TENT_NAMES_BUDGET.sm) return { shown: list, more: 0, size: "sm" };

  // Room for the "ועוד N" tail, at its widest.
  const tail = (n) => [...`ועוד ${n}`].length + SEP.length;
  const shown = [];
  let used = 0;
  for (const n of list) {
    const add = [...n].length + (shown.length ? SEP.length : 0);
    if (used + add + tail(list.length - shown.length - 1) > TENT_NAMES_BUDGET.sm) break;
    shown.push(n);
    used += add;
  }
  return { shown, more: list.length - shown.length, size: "sm" };
}
