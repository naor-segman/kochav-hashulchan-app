import { describe, it, expect } from "vitest";
import { normalizeEvent, seatingTotals } from "./eventHelpers.js";

/* FZ6: rows that reach storage malformed — a table with no capacity, a seat at
 * a table that no longer exists. Every writer in the app produces neither, so
 * normalizeEvent (the one gateway) is where they stop. */
describe("normalizeEvent — tables and seats (FZ6)", () => {
  it("a table with no capacity gets 0, not undefined", () => {
    const ev = normalizeEvent({ id: "e", tables: [{ id: "t1", name: "T" }, { id: "t2", capacity: "12" }, { id: "t3", capacity: null }] });
    expect(ev.tables.map(t => t.capacity)).toEqual([0, 12, 0]);
    expect(ev.tables.reduce((s, t) => s + t.capacity, 0)).toBe(12);   // TableBuilder's total, NaN before
  });

  it("a seat at a missing table is dropped and no longer counted as seated", () => {
    const ev = normalizeEvent({
      id: "e", guests: [{ id: "g1", name: "a" }, { id: "g2", name: "b" }],
      tables: [{ id: "t1", capacity: 10 }],
      seating: { g1: "t1", g2: "tGone" },
    });
    expect(ev.seating).toEqual({ g1: "t1" });
    expect(seatingTotals(ev.guests, ev.seating).assignedSeats).toBe(1);
  });

  it("a seat for a guest id the list does not hold is left to the merge", () => {
    const ev = normalizeEvent({ id: "e", guests: [], tables: [{ id: "t1", capacity: 10 }], seating: { gX: "t1" } });
    expect(ev.seating).toEqual({ gX: "t1" });
  });

  it("a clean seating map is returned as is", () => {
    const seating = { g1: "t1" };
    const ev = normalizeEvent({ id: "e", guests: [{ id: "g1" }], tables: [{ id: "t1", capacity: 2 }], seating });
    expect(ev.seating).toBe(seating);
  });
});
