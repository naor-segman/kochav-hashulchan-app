import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FREE_PACKAGE } from "../data/pricingCurve.js";

/* Claims the 5.10 review found the product does not keep. Each line here was on
   a public page. */
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("copy the 5.10 review corrected", () => {
  it("the hero does not call the product free 'entirely' under a paid feature", () => {
    // The bullets right above it include the entrance station, a paid feature.
    expect(read("./LandingScreen.jsx")).not.toMatch(/חינם לגמרי/);
  });

  it("the free card does not say 'try everything' above its own ✕ lines", () => {
    expect(FREE_PACKAGE.lead).not.toMatch(/הכל/);
    expect(FREE_PACKAGE.lines.some(l => !l.ok)).toBe(true);
  });

  it("the refund policy does not carve out calls it never priced", () => {
    // §2 promises a full refund within 14 days; the carve-out sat in the
    // by-quote section about people at the event, with no price to deduct.
    expect(read("./RefundScreen.jsx")).not.toMatch(/סבבי שיחות טלפון שכבר בוצעו/);
  });

  it("'מצב אורח' is gone from the pages a user reads", () => {
    for (const f of ["./PrivacyScreen.jsx", "./LoginScreen.jsx", "./SignupScreen.jsx"]) {
      const visible = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(visible, f).not.toMatch(/מצב אורח/);
    }
  });

  it("the pricing FAQ reads the free cap from the plan, not a typed number", () => {
    expect(read("./PricingScreen.jsx")).toMatch(/עד \$\{PLAN_LIMITS\.free\.maxSeatedSeats\} מוזמנים/);
  });
});
