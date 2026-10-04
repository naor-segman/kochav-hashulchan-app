/* What a marketing screenshot must never show, read from the rendered page.
 *
 * The first version of this guard looked for "כוכב השולחן" only — the name
 * before the FIRST rebrand. The second name, רוויה, and its "בטא" badge then
 * went through both shot harnesses as "ok" on 29.9 and sat in all eleven host
 * frames on the landing pages until the 3.10 audit read the pictures. A
 * guard that lists one past name is a guard against the last mistake only.
 *
 * "בטא" is matched as a whole word: HelpScreen says "בטאב" ("in the tab"),
 * and a substring test would flag a screen for an ordinary Hebrew word.
 */
const HEB = "֐-׿";
const STALE = [
  { label: "כוכב השולחן", re: /כוכב השולחן/ },
  { label: "רוויה",        re: new RegExp(`(^|[^${HEB}])ב?רוויה([^${HEB}]|$)`) },
  { label: "בטא",          re: new RegExp(`(^|[^${HEB}])בטא([^${HEB}]|$)`) },
];

/** @returns {string|null} the first stale brand token found in `text`. */
export function staleBrand(text) {
  const hit = STALE.find(s => s.re.test(text));
  return hit ? hit.label : null;
}
