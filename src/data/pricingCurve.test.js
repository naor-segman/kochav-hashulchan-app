import { describe, it, expect } from "vitest";
import {
  GUESTS_MIN, GUESTS_MAX, GUESTS_STEP, GUEST_PRESETS,
  snapGuests, stepFor, priceFor, formatShekel, PAID_FROM,
  FREE_PACKAGE, PACKAGES,
} from "./pricingCurve.js";
import { PLANS, PLAN_DB_KEY } from "./pricing.js";
import { PLAN_LIMITS, PLAN_META } from "../admin/lib/planConfig.js";

/* The per-guest price curve (WORKPLAN 136/139, owner 5.10). Every number a
   buyer sees on /pricing, the home page and the event's own card comes out of
   priceFor(), so what is pinned here is the SHAPE the owner approved, not each
   figure — the figures are a draft until the calls cost is known. */

const STEPS = [];
for (let g = GUESTS_MIN; g <= GUESTS_MAX; g += GUESTS_STEP) STEPS.push(g);

describe("pricingCurve: the price", () => {
  it("every price on the stepper ends in 9", () => {
    for (const key of ["auto", "calls"]) {
      for (const g of STEPS) expect(priceFor(key, g) % 10, `${key} ${g}`).toBe(9);
    }
  });

  it("more people never costs less", () => {
    for (const key of ["auto", "calls"]) {
      for (let i = 1; i < STEPS.length; i++) {
        expect(priceFor(key, STEPS[i]), `${key} ${STEPS[i]}`)
          .toBeGreaterThan(priceFor(key, STEPS[i - 1]));
      }
    }
  });

  it("the calls package costs more at every step — the calls are the only difference", () => {
    for (const g of STEPS) expect(priceFor("calls", g), g).toBeGreaterThan(priceFor("auto", g));
  });

  it("the 'from' price is the cheapest point on the curve", () => {
    expect(PAID_FROM).toBe(priceFor("auto", GUESTS_MIN));
    expect(PAID_FROM).toBe(149);
  });

  it("an unknown package has no price, rather than a wrong one", () => {
    expect(priceFor("onsite", 300)).toBeNull();
  });

  it("formats with a thousands comma and the sign first", () => {
    expect(formatShekel(1049)).toBe("₪1,049");
  });
});

describe("pricingCurve: the number of people", () => {
  it("the stepper snaps to its grid and stays inside it", () => {
    expect(snapGuests(0)).toBe(GUESTS_MIN);
    expect(snapGuests(5000)).toBe(GUESTS_MAX);
    expect(snapGuests(320)).toBe(300);
    expect(snapGuests("abc")).toBe(GUESTS_MIN);
    for (const p of GUEST_PRESETS) expect(snapGuests(p)).toBe(p);
  });

  it("an event's list rounds UP to the step that covers it", () => {
    // Rounding to the nearest step would sell 300 seats to a list of 320.
    expect(stepFor(320)).toBe(350);
    expect(stepFor(350)).toBe(350);
    expect(stepFor(0)).toBe(GUESTS_MIN);
    expect(stepFor(GUESTS_MAX)).toBe(GUESTS_MAX);
  });

  it("above the top step there is no self-serve price", () => {
    expect(stepFor(GUESTS_MAX + 1)).toBeNull();
  });
});

describe("pricingCurve: the cards agree with the rest of the product", () => {
  it("the free card's seating line is the gate's own number", () => {
    const line = FREE_PACKAGE.lines.find(l => l.t.includes("הושבה אוטומטית"));
    expect(line.t).toContain(String(PLAN_LIMITS.free.maxSeatedSeats));
  });

  it("the free cap and the first paid step are the same number", () => {
    // Owner, 5.10: free up to 100, paid from 100. A gap between them is a band
    // of events that can neither seat for free nor buy the smallest package.
    expect(PLAN_LIMITS.free.maxSeatedSeats).toBe(GUESTS_MIN);
  });

  it("the stepper cards, the package list and the account screen use one name per package", () => {
    const byKey = { auto: "event", calls: "calls" };
    for (const pkg of PACKAGES) {
      const plan = PLANS.find(p => p.key === byKey[pkg.key]);
      expect(plan.name, pkg.key).toBe(pkg.name);
      expect(PLAN_META[PLAN_DB_KEY[plan.key]].label, pkg.key).toBe(pkg.name);
    }
    expect(PLANS[0].name).toBe(FREE_PACKAGE.name);
  });
});
