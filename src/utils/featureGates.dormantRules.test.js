import { describe, it, expect, vi } from "vitest";

// THE DORMANT RULES, AGAINST A PLAN THAT HAS LIMITS.
//
// Under the shipping planConfig every plan has `maxGuests: Infinity` and
// `collaboration: true`. That makes five edits to featureGates.js invisible —
// the third-review mutation run (29.9) showed all five passing every test in
// the repo, and for today's config they are genuinely equivalent: no input
// tells them apart.
//
// They stop being equivalent the day a cap comes back, and "flipping the
// switch turns them on everywhere at once" (featureGates.js) is only true if
// the rules behind the switch are right. So the plan config is mocked to a
// finite free tier — an 80-row guest cap and no shared table, which is what free
// looked like before 28.9 — and the rules are asserted against THAT. Nothing
// here says what free SHOULD include; the split is the owner's decision.
vi.mock("../admin/lib/planConfig.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    getPlanLimits: (plan) => {
      const l = real.getPlanLimits(plan);
      return plan === "free" || !real.isKnownPlan(plan)
        ? { ...l, maxGuests: 80, collaboration: false }
        : l;
    },
  };
});

const { canAddGuest, guestSlotsLeft, planGuestSlotsLeft, canUseCollaboration, PLAN_GATES_ENFORCED } =
  await import("./featureGates.js");

describe("canAddGuest against an 80-row cap", () => {
  // `currentCount` is how many rows there ALREADY are. At 80 of 80 there is no
  // room for an 81st; `<=` let one more in, every time, on every plan.
  it("79 rows → may add; 80 rows → may not", () => {
    expect(canAddGuest("free", 79).withinPlan).toBe(true);
    expect(canAddGuest("free", 80).withinPlan).toBe(false);
  });
  // `allowed` is the rule AFTER the switch. With enforcement off a full plan is
  // still allowed — that is the whole point of the switch — and the day it is
  // on, the rule decides.
  it("allowed follows PLAN_GATES_ENFORCED", () => {
    expect(canAddGuest("free", 80).allowed).toBe(!PLAN_GATES_ENFORCED);
  });
});

describe("the bulk-paste allowance", () => {
  // The paste slices the pasted rows to this number. Negative would be
  // `rows.slice(0, -10)` — keeping all but the LAST ten, the opposite of a cap.
  it("never negative, even over the cap", () => {
    expect(planGuestSlotsLeft("free", 90)).toBe(0);
    expect(planGuestSlotsLeft("free", 30)).toBe(50);
  });
  // With the gates off, a paste of 400 names must not be trimmed to 80.
  it("guestSlotsLeft honours the switch", () => {
    expect(guestSlotsLeft("free", 0)).toBe(PLAN_GATES_ENFORCED ? 80 : Infinity);
  });
});

describe("canUseCollaboration on a plan without it", () => {
  it("withinPlan is the rule, allowed follows the switch", () => {
    const r = canUseCollaboration("free");
    expect(r.withinPlan).toBe(false);
    expect(r.allowed).toBe(!PLAN_GATES_ENFORCED);
  });
});
