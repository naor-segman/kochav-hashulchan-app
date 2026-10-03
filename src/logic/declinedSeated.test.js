import { describe, it, expect } from "vitest";
import { computeViolations } from "./seating.js";
import { generateSuggestions, computeQualityScore } from "./seatingAnalysis.js";
import { seatingTotals } from "../utils/eventHelpers.js";

// RG10c — a guest who declined AFTER being seated (data from before סב7, or a
// locked table) is still listed at the table. The export and seatingTotals
// skip them: they hold no chair. The violation engine and the assistant
// counted them, so the same table read "חריגה" on the seating screen and
// "fits" on the venue's printout.

const g = (id, extra = {}) => ({ id, name: id, side: "bride", group: "משפחה", count: 1, rsvp: "confirmed", ...extra });
const T = (id, capacity) => ({ id, name: id, capacity });

describe("declined guests still listed at a table hold no chair", () => {
  const guests = [g("a"), g("b"), g("d", { rsvp: "declined", count: 2 })];
  const tables = [T("t1", 2)];
  const seating = { a: "t1", b: "t1", d: "t1" };

  it("computeViolations: no capacity violation (2 active chairs at a table of 2)", () => {
    expect(computeViolations(guests, tables, [], seating)).toEqual([]);
  });

  it("agrees with seatingTotals", () => {
    expect(seatingTotals(guests, seating).assignedSeats).toBe(2);
  });

  it("the assistant raises no over-capacity suggestion", () => {
    const s = generateSuggestions(guests, tables, [], seating);
    expect(s.find(x => /חורג מהקיבולת/.test(x.explanation || ""))).toBeUndefined();
  });

  it("an active guest still over capacity IS a violation", () => {
    const more = [...guests, g("c")];
    const v = computeViolations(more, tables, [], { ...seating, c: "t1" });
    expect(v.map(x => x.type)).toEqual(["capacity"]);
    expect(v[0].text).toContain("3 מושבים על 2");
  });
});

describe("constraints with a declined guest are not conflicts", () => {
  const tables = [T("t1", 10), T("t2", 10)];
  it("apart pair at one table where one declined → no violation, no suggestion", () => {
    const guests = [g("a"), g("x", { rsvp: "declined" })];
    const cons = [{ id: "c1", type: "apart", guestA: "a", guestB: "x" }];
    const seating = { a: "t1", x: "t1" };
    expect(computeViolations(guests, tables, cons, seating)).toEqual([]);
    expect(generateSuggestions(guests, tables, cons, seating).filter(s => s.type === "apart_violated")).toEqual([]);
  });
  it("together pair at two tables where one declined → no violation, no suggestion", () => {
    const guests = [g("a"), g("x", { rsvp: "declined" })];
    const cons = [{ id: "c1", type: "together", guestA: "a", guestB: "x" }];
    const seating = { a: "t1", x: "t2" };
    expect(computeViolations(guests, tables, cons, seating)).toEqual([]);
    expect(generateSuggestions(guests, tables, cons, seating).filter(s => s.type === "together_violated")).toEqual([]);
  });
  it("the quality score is not docked for them", () => {
    const guests = [g("a"), g("b"), g("c"), g("x", { rsvp: "declined" })];
    const cons = [{ id: "c1", type: "apart", guestA: "a", guestB: "x" }];
    const seating = { a: "t1", b: "t1", c: "t1", x: "t1" };
    const tables4 = [T("t1", 4)];
    expect(computeQualityScore(guests, tables4, cons, seating, computeViolations(guests, tables4, cons, seating))).toBe(100);
  });
});
