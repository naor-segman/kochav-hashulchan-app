import { describe, it, expect } from "vitest";
import { seatsOf, setRowArrived, withArrivedSeats, arrivalTotals } from "./arrival.js";

// Four arrival.js edits passed the whole suite in the third-review mutation run
// (29.9). Two are real gaps and are pinned here (AR01, AR10). The other two cannot change
// any value a writer can produce, and are argued in the report instead:
//   - `cs > ls` vs `cs >= ls` in mergeArrivals: equal stamps come from one write
//     echoed back, and taking an identical copy changes no value;
//   - dropping `silent(c)`: it only matters for a cloud row stamped with
//     arrivedAt but carrying neither arrivedSeats nor arrived, and no writer
//     produces one — withArrivedSeats() and both SQL RPCs always write all three.
//     A differential fuzz (20,000 merges of writer-shaped rows) found 0
//     differences in arrived seats, stamp or flag.
//
// The `Math.min(100, …)` on pct was ALSO argued equivalent at first ("arrived
// is clamped to seatsOf, so it can never exceed the total"). The same fuzz
// disproved it in 197 of 20,000 cases — see the fractional-count test below.
// Recorded because it is exactly the confident-sounding analysis CLAUDE.md
// warns about.

describe("seatsOf: a row is at least one person, even with a corrupt count", () => {
  // seatingTotals() clamps with Math.max(1, …), and the door's denominator
  // comes from it. If the door's own per-row count did not clamp, a row whose
  // count went negative (a bad import cell) would count as ONE seat in the
  // total and ZERO seats when marked — the host taps "הגיע", the chip lights,
  // and the counter does not move.
  it("count -2 → 1", () => {
    expect(seatsOf({ count: -2 })).toBe(1);
  });
  it("marking that row puts one person in the room, and the counter agrees", () => {
    const g = setRowArrived({ id: "g1", name: "כהן", count: -2 }, true);
    expect(g.arrivedSeats).toEqual([0]);
    const t = arrivalTotals([g], {});
    expect(t.arrivedSeats).toBe(1);
    expect(t.totalSeats).toBe(1);
    expect(t.pct).toBe(100);
  });
});

describe("the door counter never passes 100%", () => {
  // A count of 2.5 (a spreadsheet cell, a half-typed number) is 2.5 seats in
  // the total but THREE seat indices under it (0, 1, 2 are all < 2.5) — and
  // guestSeatNames prints three place cards for it. Mark all three people and
  // the row reads 3 of 2.5. Without the clamp the door said 120% — the one
  // number a greeter uses to know whether everyone is in.
  it("count 2.5, all three marked → 100, not 120", () => {
    const g = withArrivedSeats({ id: "g1", name: "כהן", count: 2.5 }, [0, 1, 2]);
    const t = arrivalTotals([g], {});
    expect(t.arrivedSeats).toBeGreaterThan(t.totalSeats);   // the precondition: it really does overshoot
    expect(t.pct).toBe(100);
  });
});
