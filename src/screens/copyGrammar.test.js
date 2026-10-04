import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

/* Audit 3.10 (C17): the product addresses its users in the PLURAL ("שלכם",
 * "נסו") and never by gender. Each shape below was found in customer copy:
 *   - "בחשבון שלך"           (lib/stripe.js — singular, in a plural UI)
 *   - "המוזמנים/ות שלכם/ן"   (CollabScreen — slash-gendered)
 *   - "שניה"                 (messageSequence — the standard spelling is שנייה)
 * Comments are stripped (they are English notes and may quote the old text);
 * admin is the operator's own panel and is left out. */
const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "admin") walk(p, out); }
    else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const NOT_HEB = "(?![א-ת])";
const RULES = {
  "singular שלך": new RegExp(`(^|[^א-ת])שלך${NOT_HEB}`),
  "slash-gendered plural": new RegExp(`[א-ת]/(ות|ן)${NOT_HEB}`),
  "שניה (→ שנייה)": new RegExp(`(^|[^א-ת])שניה${NOT_HEB}`),
  // C14: מקטע is masculine.
  "שתי מקטעות (→ שני מקטעים)": /מקטעות/,
  // C15: English and developer slang in Hebrew copy. Each was found once:
  // "בטאב" ×4 and "בדשבורד" (Help), "חזרה לדשבורד" (404), "בפולינג הבא"
  // (gifts page), "כל הפונקציות" (account), "עותק Excel" (Help).
  "טאב (→ מסך)": new RegExp(`(^|[^א-ת])[בל]?טאב${NOT_HEB}`),
  "דשבורד": /דשבורד/,
  "פולינג": /פולינג/,
  "הפונקציות": /הפונקציות/,
  "עותק Excel (→ עותק לאקסל)": /עותק Excel/,
};

describe("customer copy: plural address, no slash-gender, no slang (audit 3.10, C14, C15, C17)", () => {
  const files = walk(SRC).map(f => [relative(SRC, f), stripComments(readFileSync(f, "utf8"))]);
  for (const [name, re] of Object.entries(RULES)) {
    it(`no ${name}`, () => {
      expect(files.filter(([, t]) => re.test(t)).map(([f]) => f)).toEqual([]);
    });
  }
  it("the matchers catch the old text and spare look-alikes", () => {
    expect(RULES["singular שלך"].test("בחשבון שלך — רעננו")).toBe(true);
    expect(RULES["singular שלך"].test("בחשבון שלכם")).toBe(false);
    expect(RULES["slash-gendered plural"].test("את המוזמנים/ות שלכם/ן")).toBe(true);
    expect(RULES["slash-gendered plural"].test("אישר/ה")).toBe(false);
    expect(RULES["שניה (→ שנייה)"].test("זה לוקח שניה:")).toBe(true);
    expect(RULES["שניה (→ שנייה)"].test("שניהם שובצו")).toBe(false);
  });
});

/* Audit 3.10, C16: one name per thing. The dominant term in the customer copy
 * was kept and the others renamed to it:
 *   "שמרו את התאריך"  over "Save the Date"      (the UI is Hebrew)
 *   "טבלה שיתופית"    over "טבלה משותפת"/"רשימת האורחים המשותפת" (nav label)
 *   "אלבום משותף"     over "אלבום האורחים"/"אלבום התמונות"/"אלבום האירוע"
 *   "קישור"           over "לינק" — the two "לינק" left are on the RSVP and
 *                     gift guest pages, whose error wording is another fix. */
const NAMING = {
  "Save the Date": /Save the Date/,
  "טבלה משותפת": /טבלה משותפת|הטבלה המשותפת|רשימת האורחים המשותפת/,
  "אלבום האורחים/התמונות/האירוע": /אלבום (האורחים|התמונות|האירוע)/,
  "לינק": /לינק/,
};
const NAMING_EXEMPT = { "לינק": ["screens/RSVPScreen.jsx", "screens/GiftScreen.jsx"] };

describe("one name per thing (audit 3.10, C16)", () => {
  const files = walk(SRC).map(f => [relative(SRC, f), stripComments(readFileSync(f, "utf8"))]);
  for (const [name, re] of Object.entries(NAMING)) {
    it(`no ${name}`, () => {
      const exempt = NAMING_EXEMPT[name] || [];
      expect(files.filter(([f, t]) => !exempt.includes(f) && re.test(t)).map(([f]) => f)).toEqual([]);
    });
  }
});
