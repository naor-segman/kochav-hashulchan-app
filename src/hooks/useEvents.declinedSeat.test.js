import { describe, it, expect } from "vitest";
import { freeDeclinedSeats } from "./useEvents.js";

/* RG7: a guest who declines gives their chair back — and the lock that pinned
 * them to it. The lock used to stay behind, pinning a guest to a seat they no
 * longer had. */
describe("freeDeclinedSeats", () => {
  const before = {
    guests: [{ id: "g1", rsvp: "confirmed" }, { id: "g2", rsvp: "confirmed" }],
    seating: { g1: "t1", g2: "t1" },
    lockedGuests: ["g1", "g2"],
  };

  it("frees the seat AND the lock in the same step", () => {
    const after = { ...before, guests: [{ id: "g1", rsvp: "declined" }, before.guests[1]] };
    const out = freeDeclinedSeats(before, after);
    expect(out.seating).toEqual({ g2: "t1" });
    expect(out.lockedGuests).toEqual(["g2"]);
  });

  it("leaves the locks alone when nobody newly declined", () => {
    const after = { ...before, guests: [{ ...before.guests[0], notes: "x" }, before.guests[1]] };
    expect(freeDeclinedSeats(before, after)).toBe(after);
  });

  it("an already-declined, still-seated guest (older data) keeps seat and lock", () => {
    const old = { ...before, guests: [{ id: "g1", rsvp: "declined" }, before.guests[1]] };
    const after = { ...old, venue: "x" };
    expect(freeDeclinedSeats(old, after)).toBe(after);
  });
});
