import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

/* Audit 3.10 (C2, C3, C4). Two facts the customer copy got wrong:
 *
 *  - It named Stripe as the payment processor ("התשלום התקבל אצל Stripe",
 *    "חברת הסליקה (כיום Stripe)"). Stripe cannot serve an Israeli merchant and
 *    the provider is NOT decided, so no customer-facing sentence may name one.
 *    The code is still built on Stripe — `isStripeConfigured`, lib/stripe.js —
 *    and those identifiers are fine; only text a person reads is checked.
 *  - It promised invoices ("החשבוניות"). The operator is an עוסק פטור and
 *    issues receipts only; "חשבונית מס" survives only in the Terms sentence
 *    that says one is NOT issued.
 *
 * Comments are stripped first: the reasons for these rules are written in
 * comments, and a comment is not copy. Admin is left out — it is the
 * operator's own panel, where Stripe is the operator's real tool. */
const SRC = fileURLToPath(new URL("..", import.meta.url));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "admin") walk(p, out); }
    else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

/** Source with block, line and JSX comments removed (URLs' "//" kept). */
function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const HEB = "֐-׿";
/** "Stripe" inside a run of text that also holds Hebrew — i.e. a sentence. */
const STRIPE_IN_COPY = new RegExp(`[${HEB}][^"'\`<>{}\\n]*\\bStripe\\b|\\bStripe\\b[^"'\`<>{}\\n]*[${HEB}]`);
const INVOICE = /חשבוניות|חשבונית(?! מס)/;

describe("customer copy names no payment provider and promises no invoices", () => {
  const files = walk(SRC).map(f => [relative(SRC, f), stripComments(readFileSync(f, "utf8"))]);

  it("no Hebrew sentence names Stripe", () => {
    expect(files.filter(([, t]) => STRIPE_IN_COPY.test(t)).map(([f]) => f)).toEqual([]);
  });
  it("no copy promises a חשבונית (receipts only)", () => {
    expect(files.filter(([, t]) => INVOICE.test(t)).map(([f]) => f)).toEqual([]);
  });
  it("the matchers catch the old sentences and spare identifiers", () => {
    expect(STRIPE_IN_COPY.test('"התשלום התקבל אצל Stripe. החבילה תתעדכן"')).toBe(true);
    expect(STRIPE_IN_COPY.test("<strong>חברת הסליקה (כיום Stripe)</strong>")).toBe(true);
    expect(STRIPE_IN_COPY.test("if (!isStripeConfigured) return;")).toBe(false);
    expect(STRIPE_IN_COPY.test('import { x } from "../lib/stripe.js";')).toBe(false);
    expect(INVOICE.test("לא הצלחנו לפתוח את החשבוניות")).toBe(true);
    expect(INVOICE.test("נשלחת קבלה ולא חשבונית מס.")).toBe(false);
    expect(stripComments("a // הסבר על החשבוניות\nb")).toBe("a \nb");
    expect(stripComments('href="https://x.co/y"')).toBe('href="https://x.co/y"');
  });
});
