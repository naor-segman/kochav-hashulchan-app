import { describe, it, expect } from "vitest";
import { canSeatMore } from "./featureGates.js";

// canSeatMore is the one numeric limit a customer meets today (free seats up to
// maxSeatedSeats people). Two edits to it passed the whole suite in the third-
// review mutation run (29.9).
//
// Five more featureGates survivors are NOT pinned here, on purpose, and the
// report says so: under the shipping planConfig every plan has
// `maxGuests: Infinity` and `collaboration: true`, so `<` vs `<=` on the guest
// cap, the negative-slots clamp, and the three `!PLAN_GATES_ENFORCED ||`
// short-circuits on canAddGuest / guestSlotsLeft / canUseCollaboration all
// produce identical answers for every input. See
// featureGates.dormantRules.test.js for the same rules pinned against a mocked,
// finite plan — the day a cap comes back, that is the file that notices.

describe("canSeatMore: a row is at least one person", () => {
  // `guestSeats(g) = g.count || 1` everywhere else, and the seating engine
  // clamps to 1. A row whose count went negative (a bad import cell, a hand-
  // edited payload) must not SUBTRACT people from the allowance: without the
  // clamp, one row of -150 lets 349 real people through a 200-seat free cap.
  it("count -3 counts as 1", () => {
    expect(canSeatMore("free", [{ count: -3 }, { count: 2 }]).seats).toBe(3);
  });
  it("and cannot be used to get under the cap", () => {
    const guests = [{ count: -150 }, ...Array.from({ length: 349 }, () => ({ count: 1 }))];
    const r = canSeatMore("free", guests);
    expect(r.seats).toBe(350);
    expect(r.withinPlan).toBe(false);
  });
});

describe("canSeatMore: a COUNT instead of the array fails loudly, with the reason", () => {
  // Both the guard and the line after it throw a TypeError for a number, so the
  // type alone proves nothing. What the guard adds is the sentence: it names
  // the seats-versus-rows mistake ("pass ev.guests, not a count") instead of
  // "guests.filter is not a function", which sends the next person looking in
  // the wrong place.
  it("names the mistake", () => {
    expect(() => canSeatMore("free", 250)).toThrow(/pass ev\.guests, not a count/);
  });
});
