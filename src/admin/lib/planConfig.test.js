import { describe, it, expect } from "vitest";
import {
  PLAN_LIMITS, PLAN_META, STATUS_META, ALARMING_STATUSES,
  PLAN_KEYS, STATUS_KEYS,
  getPlanLimits, getPlanLabel, getStatusLabel,
  isKnownPlan, isKnownStatus, displayStatus,
} from "./planConfig.js";

/**
 * planConfig.js had no test of its own, and every plan limit featureGates.js
 * checks is a number in this file. featureGates.test.js exercises the RULE
 * (`currentCount < maxGuests`) — nothing anywhere pinned the value the rule is
 * applied to, so `maxGuests: 80` becoming `8` passed the whole suite.
 *
 * It is also the file the two customer-facing surfaces read for their Hebrew:
 * AccountScreen renders PLAN_META and STATUS_META directly, and CLAUDE.md
 * records that this module ships in the customer bundle despite the "admin is
 * lazy-loaded" claim. Both of its documented incidents are label lookups
 * falling through — `enterprise_annual` rendering as a plan NAME mid-Hebrew
 * table, and `incomplete_expired` reaching the panel unmapped and clipping to
 * "te_expired" at 390px.
 */

describe("planConfig — the plan limits featureGates actually checks", () => {
  it("pins the exact free-tier numbers", () => {
    // These two are the entire free tier. Changing either is a pricing decision
    // (and the free/paid split is frozen), never a refactor.
    expect(PLAN_LIMITS.free.maxEvents).toBe(1);
    expect(PLAN_LIMITS.free.maxGuests).toBe(80);
    expect(PLAN_LIMITS.free.advancedExports).toBe(false);
    expect(PLAN_LIMITS.free.aiFeatures).toBe(false);
    expect(PLAN_LIMITS.free.collaboration).toBe(false);
  });

  it("pins the exact pro-tier numbers", () => {
    expect(PLAN_LIMITS.pro.maxEvents).toBe(20);
    expect(PLAN_LIMITS.pro.maxGuests).toBe(500);
    expect(PLAN_LIMITS.pro.advancedExports).toBe(true);
    expect(PLAN_LIMITS.pro.aiFeatures).toBe(false);
    expect(PLAN_LIMITS.pro.collaboration).toBe(false);
  });

  it("gives enterprise true Infinity, not a large finite number", () => {
    // `currentCount < maxEvents` is the gate. A sentinel like 9999 is a wall an
    // enterprise account can actually hit, and `guestSlotsLeft` special-cases
    // Infinity by identity — a big number there returns a finite slot count and
    // a bulk paste starts silently truncating.
    expect(PLAN_LIMITS.enterprise.maxEvents).toBe(Infinity);
    expect(PLAN_LIMITS.enterprise.maxGuests).toBe(Infinity);
    expect(Number.isFinite(PLAN_LIMITS.enterprise.maxGuests)).toBe(false);
    expect(PLAN_LIMITS.enterprise.advancedExports).toBe(true);
    expect(PLAN_LIMITS.enterprise.aiFeatures).toBe(true);
    expect(PLAN_LIMITS.enterprise.collaboration).toBe(true);
  });

  it("never lets a cheaper plan out-rank a dearer one on any limit", () => {
    // The property behind the three tables above: a customer who pays more must
    // never get less. This catches a limit edited in one tier and forgotten in
    // the next, which no single-tier assertion can.
    const numeric = ["maxEvents", "maxGuests"];
    const boolean = ["advancedExports", "aiFeatures", "collaboration"];
    for (const k of numeric) {
      expect(PLAN_LIMITS.free[k]).toBeLessThanOrEqual(PLAN_LIMITS.pro[k]);
      expect(PLAN_LIMITS.pro[k]).toBeLessThanOrEqual(PLAN_LIMITS.enterprise[k]);
    }
    for (const k of boolean) {
      expect(PLAN_LIMITS.free[k] <= PLAN_LIMITS.pro[k]).toBe(true);
      expect(PLAN_LIMITS.pro[k] <= PLAN_LIMITS.enterprise[k]).toBe(true);
    }
  });

  it("gives every plan every limit key, so no gate ever reads undefined", () => {
    // `currentCount < undefined` is false — a missing key does not throw, it
    // locks the tier out of the feature entirely.
    const keys = Object.keys(PLAN_LIMITS.free);
    for (const plan of PLAN_KEYS) {
      expect(Object.keys(PLAN_LIMITS[plan]).sort()).toEqual([...keys].sort());
      for (const k of keys) expect(PLAN_LIMITS[plan][k]).toBeDefined();
    }
  });
});

describe("planConfig — getPlanLimits falls back rather than returning nothing", () => {
  it("resolves each known plan to its own table", () => {
    for (const plan of PLAN_KEYS) expect(getPlanLimits(plan)).toBe(PLAN_LIMITS[plan]);
  });

  it("falls back to FREE — the most restrictive tier — for anything unknown", () => {
    // A DB value nobody anticipated must not accidentally grant enterprise.
    //
    // NOT asserted here, because it is currently FALSE and a test must not
    // encode a bug as correct behaviour: `PLAN_LIMITS[plan] ?? PLAN_LIMITS.free`
    // reads through the prototype chain, so the four Object.prototype names
    // ("toString", "constructor", "valueOf", "hasOwnProperty") resolve to a
    // FUNCTION rather than to undefined, `??` never fires, and every limit
    // destructures to undefined. Measured: canAddGuest("toString", 0).withinPlan
    // is false and planGuestSlotsLeft("toString", 0) is NaN — locked out of
    // everything instead of falling back to free. `plan` is a DB text column
    // written by the Stripe webhook, so it is not reachable from host input
    // today; the one-line fix is Object.hasOwn(). Reported, not fixed here —
    // this branch is test infrastructure.
    for (const bad of [undefined, null, "", "enterprise_annual", "PRO", 0, false]) {
      expect(getPlanLimits(bad)).toBe(PLAN_LIMITS.free);
    }
  });

  it("does not treat a falsy-but-valid lookup as missing", () => {
    // `??`, not `||`. The distinction matters the moment a limits object is
    // ever falsy, and `||` would also swallow a legitimately empty tier.
    expect(getPlanLimits("free")).toBe(PLAN_LIMITS.free);
  });
});

describe("planConfig — Hebrew labels, and the raw DB key never reaching a screen", () => {
  it("labels every plan in Hebrew", () => {
    for (const plan of PLAN_KEYS) {
      expect(getPlanLabel(plan)).toBe(PLAN_META[plan].label);
      expect(getPlanLabel(plan)).toMatch(/[֐-׿]/);
    }
    expect(getPlanLabel("free")).toBe("חינמי");
    expect(getPlanLabel("pro")).toBe("מקצועי");
    expect(getPlanLabel("enterprise")).toBe("ארגוני");
  });

  it("never falls through to the raw key for an unknown plan", () => {
    // The recorded incident: `enterprise_annual` rendered as a plan NAME in the
    // middle of a Hebrew table and read like a real label.
    expect(getPlanLabel("enterprise_annual")).toBe("תוכנית לא מוכרת");
    expect(getPlanLabel("enterprise_annual")).not.toContain("enterprise");
    expect(getPlanLabel(null)).toBe("—");
    expect(getPlanLabel("")).toBe("—");
  });

  it("labels every status in Hebrew and never falls through to the raw key", () => {
    for (const s of STATUS_KEYS) {
      expect(getStatusLabel(s)).toBe(STATUS_META[s].label);
      expect(getStatusLabel(s)).toMatch(/[֐-׿]/);
      expect(getStatusLabel(s)).not.toMatch(/[a-z_]{4,}/);
    }
    expect(getStatusLabel("past_due")).toBe("תשלום נכשל");
    expect(getStatusLabel("something_new")).toBe("סטטוס לא מוכר");
    expect(getStatusLabel(null)).toBe("—");
  });

  it("reports known-ness so the screen can put the raw value in a title instead", () => {
    expect(isKnownPlan("pro")).toBe(true);
    expect(isKnownPlan("enterprise_annual")).toBe(false);
    expect(isKnownPlan(null)).toBe(false);
    expect(isKnownStatus("incomplete_expired")).toBe(true);
    expect(isKnownStatus("something_new")).toBe(false);
    expect(isKnownStatus(undefined)).toBe(false);
  });

  it("maps every subscription status Stripe can emit", () => {
    // All four of these reached the panel unmapped once. They are ordinary
    // subscription states, not errors — they simply had no label, and one of
    // them clipped to "te_expired" on a phone.
    for (const s of ["active", "trialing", "cancelled", "expired", "past_due",
                     "incomplete", "incomplete_expired", "unpaid", "paused"]) {
      expect(STATUS_META[s]).toBeDefined();
      expect(isKnownStatus(s)).toBe(true);
    }
  });
});

describe("planConfig — the delinquency rule", () => {
  it("shows past_due even while Stripe still calls the subscription active", () => {
    // Stripe keeps a failing card as `active` through the retry window and only
    // raises the separate flag. Without this, a customer whose card has been
    // declining for three weeks renders as a green "פעיל" and nobody acts.
    expect(displayStatus({ status: "active", payment_past_due: true })).toBe("past_due");
    expect(displayStatus({ status: "trialing", payment_past_due: true })).toBe("past_due");
  });

  it("passes the nominal status through when nothing is overdue", () => {
    expect(displayStatus({ status: "active", payment_past_due: false })).toBe("active");
    expect(displayStatus({ status: "cancelled" })).toBe("cancelled");
  });

  it("treats a missing subscription as expired, not as active or blank", () => {
    // The default has to be the SAFE side: a row with no status is not a paying
    // customer, and "" would render as "—" next to a live plan badge.
    expect(displayStatus(null)).toBe("expired");
    expect(displayStatus(undefined)).toBe("expired");
    expect(displayStatus({})).toBe("expired");
    expect(displayStatus({ status: null })).toBe("expired");
  });

  it("flags exactly the statuses that need somebody to act", () => {
    expect([...ALARMING_STATUSES].sort()).toEqual(["past_due", "unpaid"]);
    for (const s of ALARMING_STATUSES) expect(STATUS_META[s]).toBeDefined();
    for (const s of ["active", "trialing", "paused", "cancelled", "expired"]) {
      expect(ALARMING_STATUSES.has(s)).toBe(false);
    }
  });

  it("puts the statuses that need action first in the picker order", () => {
    expect(STATUS_KEYS[0]).toBe("past_due");
    expect(STATUS_KEYS.slice(0, ALARMING_STATUSES.size).sort())
      .toEqual([...ALARMING_STATUSES].sort());
  });
});

describe("planConfig — the ordered key lists cannot drift from the tables", () => {
  it("lists every plan exactly once, cheapest first", () => {
    expect(PLAN_KEYS).toEqual(["free", "pro", "enterprise"]);
    expect([...PLAN_KEYS].sort()).toEqual(Object.keys(PLAN_LIMITS).sort());
    expect([...PLAN_KEYS].sort()).toEqual(Object.keys(PLAN_META).sort());
    expect(new Set(PLAN_KEYS).size).toBe(PLAN_KEYS.length);
  });

  it("lists every status exactly once", () => {
    // A status present in STATUS_META but absent from STATUS_KEYS is a filter
    // option the panel cannot offer — the rows exist and cannot be found.
    expect([...STATUS_KEYS].sort()).toEqual(Object.keys(STATUS_META).sort());
    expect(new Set(STATUS_KEYS).size).toBe(STATUS_KEYS.length);
  });

  it("gives every plan and status a full colour triple", () => {
    for (const meta of [...Object.values(PLAN_META), ...Object.values(STATUS_META)]) {
      for (const k of ["label", "color", "bgColor", "borderColor"]) {
        expect(meta[k]).toBeTypeOf("string");
        expect(meta[k].length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the enterprise plan colour on --accent-text, never the raw accent", () => {
    // Bug class 4, in a value AccountScreen paints onto TEXT. It was the literal
    // #E8437B once — that is --accent, which measures 3.80:1 on white and
    // 3.63:1 on this entry's own cream ground, i.e. below the floor on both.
    expect(PLAN_META.enterprise.color).toBe("var(--accent-text)");
    expect(PLAN_META.enterprise.color.toUpperCase()).not.toContain("E8437B");
    expect(PLAN_META.enterprise.color).not.toBe("var(--accent)");
  });
});
