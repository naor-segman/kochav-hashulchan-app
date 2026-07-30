import { describe, it, expect } from "vitest";
import {
  canCreateEvent, canAddGuest, canUseAdvancedExports, canUseAI, canUseCollaboration,
  guestSlotsLeft, planGuestSlotsLeft, PLAN_GATES_ENFORCED,
} from "./featureGates.js";

// Two separate questions live in this module, and they used to be one:
//   withinPlan — what the plan rule says, always meaningful
//   allowed    — what the app actually does about it right now
// Enforcement is off (see PLAN_GATES_ENFORCED), so the rules are asserted
// through `withinPlan` and would go on holding the day the switch flips.

describe("plan rules — what each plan allows", () => {
  it("free is one event", () => {
    expect(canCreateEvent("free", 0).withinPlan).toBe(true);
    expect(canCreateEvent("free", 1).withinPlan).toBe(false);
    expect(canCreateEvent("free", 1).reason).toContain("1");
  });

  it("pro is twenty events", () => {
    expect(canCreateEvent("pro", 19).withinPlan).toBe(true);
    expect(canCreateEvent("pro", 20).withinPlan).toBe(false);
  });

  it("enterprise is unlimited, and says nothing about it", () => {
    expect(canCreateEvent("enterprise", 9999).withinPlan).toBe(true);
    expect(canCreateEvent("enterprise", 9999).reason).toBeNull();
  });

  it("free is eighty guests", () => {
    expect(canAddGuest("free", 79).withinPlan).toBe(true);
    expect(canAddGuest("free", 80).withinPlan).toBe(false);
  });

  it("enterprise guests are unlimited", () => {
    expect(canAddGuest("enterprise", 100000).withinPlan).toBe(true);
  });

  it("an unknown plan key falls back to the free limits", () => {
    expect(canCreateEvent("bogus", 1).withinPlan).toBe(false);
    expect(canUseAdvancedExports("bogus").withinPlan).toBe(false);
  });
});

describe("planGuestSlotsLeft — the room a bulk paste has", () => {
  it("counts down and floors at zero", () => {
    expect(planGuestSlotsLeft("free", 0)).toBe(80);
    expect(planGuestSlotsLeft("free", 79)).toBe(1);
    expect(planGuestSlotsLeft("free", 80)).toBe(0);
    expect(planGuestSlotsLeft("free", 900)).toBe(0);   // never negative
  });

  it("is Infinity where the plan has no ceiling", () => {
    expect(planGuestSlotsLeft("enterprise", 5000)).toBe(Infinity);
  });
});

describe("the enforcement switch", () => {
  it("is currently off, so nothing is withheld", () => {
    expect(PLAN_GATES_ENFORCED).toBe(false);
    expect(canCreateEvent("free", 50).allowed).toBe(true);
    expect(canAddGuest("free", 5000).allowed).toBe(true);
    expect(guestSlotsLeft("free", 5000)).toBe(Infinity);
  });

  // The point of keeping both fields: turning the switch on must not require
  // rediscovering what the limits were.
  it("leaves the rules intact underneath while it is off", () => {
    expect(canAddGuest("free", 5000).withinPlan).toBe(false);
    expect(canAddGuest("free", 5000).limit).toBe(80);
    expect(canAddGuest("free", 5000).reason).toContain("80");
  });

  it("agrees with itself — allowed is the rule once the switch is on", () => {
    for (const [plan, count] of [["free", 0], ["free", 80], ["pro", 19], ["pro", 500], ["enterprise", 9]]) {
      const g = canAddGuest(plan, count);
      expect(g.allowed).toBe(PLAN_GATES_ENFORCED ? g.withinPlan : true);
    }
  });
});

describe("feature flags by plan", () => {
  // `withinPlan` is the RULE; `allowed` is the rule after PLAN_GATES_ENFORCED.
  // These three used to return the raw rule as `allowed`, which meant wiring
  // them to a call site would have enforced the paid split while the switch was
  // off — so they were never wired at all, and flipping the switch would have
  // enforced nothing for them. The rule is what these assert.
  it("advanced exports: pro and up", () => {
    expect(canUseAdvancedExports("free").withinPlan).toBe(false);
    expect(canUseAdvancedExports("pro").withinPlan).toBe(true);
    expect(canUseAdvancedExports("enterprise").withinPlan).toBe(true);
  });

  it("AI and collaboration: enterprise only", () => {
    expect(canUseAI("pro").withinPlan).toBe(false);
    expect(canUseAI("enterprise").withinPlan).toBe(true);
    expect(canUseCollaboration("pro").withinPlan).toBe(false);
    expect(canUseCollaboration("enterprise").withinPlan).toBe(true);
  });

  // The switch is the single point of control. While it is off nothing is
  // blocked, including for the plans the rule excludes — that is the frozen
  // decision, and this pins it so a call site can be wired safely.
  it("every gate returns allowed while enforcement is off", () => {
    expect(PLAN_GATES_ENFORCED).toBe(false);
    for (const plan of ["free", "pro", "enterprise"]) {
      expect(canUseAdvancedExports(plan).allowed).toBe(true);
      expect(canUseAI(plan).allowed).toBe(true);
      expect(canUseCollaboration(plan).allowed).toBe(true);
    }
  });
});
