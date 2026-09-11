import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { LEGAL, legalLine, legalTel } from "./company.js";

/**
 * The operator identity actually reaches the pages that legally need it.
 * Checklist 19–20.
 *
 * Why a test and not "we added it and looked": the three legal pages went live
 * carrying NO identity at all — no name, no registration number, no phone, only
 * a support mailbox — and nothing in a 1,278-test suite noticed, because
 * nothing looks at them. They are also the pages nobody opens, so a refactor
 * that drops the block would not be caught by anyone using the product either.
 *
 * The assertions are deliberately about REACHING THE PAGE, not about the exact
 * wording: the copy around it is free to change, the identity is not.
 */

const read = (f) => readFileSync(new URL(`../screens/${f}`, import.meta.url), "utf8");

const PAGES = [
  ["TermsScreen.jsx",         "תנאי שימוש"],
  ["PrivacyScreen.jsx",       "מדיניות פרטיות"],
  ["AccessibilityScreen.jsx", "הצהרת נגישות"],
];

describe("legal identity: the constants", () => {
  it("carries a name, a registration type and a number", () => {
    expect(LEGAL.name.trim().length).toBeGreaterThan(2);
    expect(LEGAL.type.trim().length).toBeGreaterThan(2);
    // Nine digits, the shape of an Israeli sole-trader registration.
    expect(LEGAL.taxId).toMatch(/^\d{9}$/);
  });

  it("builds one identity line", () => {
    expect(legalLine()).toContain(LEGAL.name);
    expect(legalLine()).toContain(LEGAL.taxId);
    expect(legalLine()).toContain(LEGAL.type);
  });

  it("builds a tel: href with digits only", () => {
    expect(legalTel()).toBe(`tel:${LEGAL.phone.replace(/[^\d+]/g, "")}`);
    expect(legalTel()).not.toMatch(/[-\s]/);
  });
});

describe("legal identity: it reaches all three legal pages", () => {
  for (const [file, label] of PAGES) {
    it(`${label} renders the identity from company.js`, () => {
      const src = read(file);
      // From the shared constants, never retyped — a hardcoded "313614067" on
      // one page and an edited company.js is exactly the drift this prevents.
      expect(src, file).toContain("LEGAL.name");
      expect(src, file).toContain("LEGAL.taxId");
      expect(src, file).toContain("LEGAL.phone");
      expect(src, file).not.toContain(LEGAL.taxId);
    });

    it(`${label} does not print an empty address row`, () => {
      // The row is rendered only when LEGAL.address is non-empty. A legal page
      // showing "כתובת:" with nothing after it reads as a broken template.
      expect(read(file), file).toContain("LEGAL.address &&");
    });

    it(`${label} says when it was last updated`, () => {
      expect(read(file), file).toMatch(/עודכן לאחרונה: .+\d{4}/);
    });
  }

  it("the accessibility coordinator is named AND reachable by phone", () => {
    // The regulations ask for a named coordinator with a way to reach them.
    // This page used to give an email address and nothing else — and someone
    // who cannot use the site is often the person who cannot email about it.
    const src = read("AccessibilityScreen.jsx");
    expect(src).toContain("רכז הנגישות");
    expect(src).toContain("legalTel()");
  });
});
