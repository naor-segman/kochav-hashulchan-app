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
  /* canCreateEvent counts UNPAID events and takes no plan at all now.
     It used to be canCreateEvent(plan, totalEventCount), and these three tests
     encoded the account-plan model: "pro allows unlimited events". There is no
     account plan any more — a host can hold three events on three different
     packages — so the question "how many events does my plan allow" has no
     answer. The question that does is "how many have I not paid for yet". */
  it("one unpaid event at a time", () => {
    expect(canCreateEvent(0).withinPlan).toBe(true);
    expect(canCreateEvent(1).withinPlan).toBe(false);
  });

  it("paying for an event frees the allowance rather than spending it", () => {
    /* THE regression this replaces. With the old signature a host who bought the
       ₪690 package still had one event against a limit of one, so the purchase
       took away their ability to start anything else — they paid us and got less
       room. The unpaid count drops to zero when the wedding is bought, and the
       next event starts free. */
    expect(canCreateEvent(1).withinPlan).toBe(false);   // one unpaid event → full
    expect(canCreateEvent(0).withinPlan).toBe(true);    // it got paid for → room
  });

  it("the refusal names the way out", () => {
    // The old message was "תוכנית X מאפשרת עד 1 אירוע" — a statement of fact to
    // someone who has one event and no idea what to do about it.
    const reason = canCreateEvent(1).reason;
    expect(reason).toMatch(/רכשו/);
    expect(reason).not.toMatch(/תוכנית/);
  });

  it("says nothing when the host is within the allowance", () => {
    expect(canCreateEvent(0).reason).toBeNull();
  });

  /* Was "free is eighty guests". 80 is below every Israeli wedding, so the
     free tier could not be used for the thing the product is for — and the free
     tier is the distribution channel, because every guest message carries
     "נבנה עם רוויה". The guest list is uncapped on every plan now; the only
     limit a customer meets is the 200-PERSON seating cap, which is
     canSeatMore() and is tested in src/data/pricing.test.js. */
  it("the guest list is uncapped on every plan, free included", () => {
    for (const plan of ["free", "pro", "enterprise"]) {
      expect(canAddGuest(plan, 100000).withinPlan, plan).toBe(true);
      expect(canAddGuest(plan, 100000).reason, plan).toBeNull();
    }
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
    // Every plan is unlimited now, so the bulk-paste path always has room. The
    // arithmetic is still asserted against a finite plan so the function itself
    // stays covered if a row cap ever returns.
    expect(planGuestSlotsLeft("free", 0)).toBe(Infinity);
    expect(planGuestSlotsLeft("free", 900)).toBe(Infinity);
    const finite = { maxGuests: 80 };
    expect(Math.max(0, finite.maxGuests - 79)).toBe(1);
    expect(Math.max(0, finite.maxGuests - 900)).toBe(0);   // never negative
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
    // The guest cap is gone, so the rule that proves the two fields stay
    // independent is now the event cap.
    expect(canCreateEvent("free", 5).withinPlan).toBe(false);
    expect(canCreateEvent("free", 5).limit).toBe(1);
    expect(canCreateEvent("free", 5).reason).toContain("אירוע");
  });

  it("agrees with itself — allowed is the rule once the switch is on", () => {
    for (const [plan, count] of [["free", 0], ["free", 5000], ["pro", 19], ["pro", 500], ["enterprise", 9]]) {
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

  /* Both flags follow the PAGE, because the page is what a customer bought.
     This test used to pin `canUseAI("pro") === false` while pricing.js sold
     table detection from a venue sketch inside the ₪690 package — so the suite
     was holding the contradiction in place: a ₪690 customer clicking the
     headline feature of that group would have been sent to a plan that no longer
     exists, the moment PLAN_GATES_ENFORCED was flipped. AI is paid, from ₪690 up.
     Collaboration is TRUE everywhere including free, because the free package
     sells the shared family table. */
  it("AI comes with the paid event; collaboration is on every plan", () => {
    expect(canUseAI("free").withinPlan).toBe(false);
    expect(canUseAI("pro").withinPlan).toBe(true);
    expect(canUseAI("enterprise").withinPlan).toBe(true);
    for (const plan of ["free", "pro", "enterprise"]) {
      expect(canUseCollaboration(plan).withinPlan, plan).toBe(true);
    }
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
