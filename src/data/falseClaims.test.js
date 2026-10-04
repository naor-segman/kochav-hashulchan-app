import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* Claims that were checked against the code and found FALSE (28.9 audit).
 *
 * Each one was on a page a guest or a paying host reads. The corrections are
 * small; what this file guards against is the phrase drifting back in from a
 * copy that was not updated — the service page repeated the gift-screen
 * sentence word for word, which is how one false claim became two.
 *
 * Comments are stripped first: several fixes quote the old wording to explain
 * why it went, and that must not count. */

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const strip = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const FILES = sources("src").map(f => [f, strip(readFileSync(f, "utf8"))]);

const FALSE = [
  // The gift wall shows name and blessing, never an amount.
  [/הברכה והסכום[\s\S]{0,20}מופיעים/, "the amount appears on the wall"],
  // There is no transfer: the gift page records a declaration, nothing is charged.
  [/בהעברה מאובטחת/, "gifts go by secure transfer"],
  // The sent-mark is set when WhatsApp opens; the app does not know what arrived.
  [/מי כבר קיבל/, "tracking who already received"],
  // The floor plan has no print view.
  [/מפת אולם להדפסה/, "a printable floor plan"],
  // …and the same claim in other words: the event-day SEO description said
  // the door "מדפיס … מפת הושבה לאולם" (audit 3.10, C22). What prints is the
  // seating LIST — full, or the compact one for the venue staff.
  [/מפת הושבה (לאולם|להדפסה)|מדפיס[^"\n]{0,40}מפת הושבה/, "a printed seating map"],
  // Event-site photos are purged 30 days after the event.
  [/ההושבה והתמונות/, "photos stay with you after the event"],
  // There are three xlsx exports, not "everything".
  [/הכל לאקסל/, "everything exports to Excel"],
  // There is no PDF export anywhere in the product (checklist 36).
  [/\(PDF/, "a PDF export"],
  // RSVP answers update the list only for matched guests, when the RSVP
  // screen is opened (ת, 1.10).
  [/כל תשובה נכנסת לרשימת האורחים מעצמה/, "every RSVP answer enters the list by itself"],
  // An unsourced statistic in the Help screen (owner, 2.10: remove it).
  [/8% עד 15%/, "a no-show rate of 8%–15%"],
  // seating.js scores SAME-side neighbours up — it keeps each side together;
  // nothing balances the two sides against each other (3.10, tour review).
  [/(מתאזנת|תתאזן|מתאזן) ביניהם/, "seating balances the two sides"],
];

describe("claims measured false stay out of the shipped source", () => {
  for (const [re, what] of FALSE) {
    it(`no "${what}"`, () => {
      const hits = FILES.filter(([, s]) => re.test(s)).map(([f]) => f);
      expect(hits).toEqual([]);
    });
  }
});
