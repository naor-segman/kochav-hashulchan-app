import { describe, it, expect } from "vitest";
import { generateSuggestions, computeQualityScore } from "./seatingAnalysis.js";
import { computeViolations } from "./seating.js";

// Concise fixtures.
const g = (id, extra = {}) => ({ id, name: id, side: "bride", group: "משפחה", count: 1, rsvp: "pending", ...extra });
const t = (id, capacity) => ({ id, name: id, capacity });
const together = (a, b) => ({ id: `tog-${a}-${b}`, type: "together", guestA: a, guestB: b });
const apart = (a, b) => ({ id: `apt-${a}-${b}`, type: "apart", guestA: a, guestB: b });

const find = (arr, type) => arr.find(s => s.type === type);

describe("generateSuggestions", () => {
  it("returns nothing without guests or tables", () => {
    expect(generateSuggestions([], [t("t1", 10)], [], {})).toEqual([]);
    expect(generateSuggestions([g("a")], [], [], {})).toEqual([]);
  });

  it("surfaces an actionable 'unassigned' suggestion when some guests are seated and some are not", () => {
    const guests = [g("a"), g("b"), g("c")];
    const seating = { a: "t1" }; // b, c unseated
    const s = generateSuggestions(guests, [t("t1", 10)], [], seating);
    const unassigned = find(s, "unassigned");
    expect(unassigned).toBeDefined();
    expect(unassigned.canApply).toBe(true);
    expect(unassigned.applyAction).toEqual({ type: "seatUnassigned", count: 2 });
  });

  it("excludes declined guests from the unassigned count (they don't need a table)", () => {
    // a seated; b active-unseated; c DECLINED-unseated. Only b should count.
    const guests = [g("a"), g("b"), g("c", { rsvp: "declined" })];
    const seating = { a: "t1" };
    const s = generateSuggestions(guests, [t("t1", 10)], [], seating);
    const unassigned = find(s, "unassigned");
    expect(unassigned).toBeDefined();
    expect(unassigned.applyAction.count).toBe(1); // b only, NOT c
    // explanation denominator is active guests (2), not all 3
    expect(unassigned.explanation).toContain("1 מתוך 2");
  });

  it("does not raise an unassigned suggestion when the only unseated guests are declined", () => {
    const guests = [g("a"), g("b", { rsvp: "declined" })];
    const seating = { a: "t1" };
    const s = generateSuggestions(guests, [t("t1", 10)], [], seating);
    expect(find(s, "unassigned")).toBeUndefined();
  });

  it("flags an 'apart' violation when two apart-guests share a table", () => {
    const guests = [g("a"), g("b")];
    const seating = { a: "t1", b: "t1" };
    const s = generateSuggestions(guests, [t("t1", 10), t("t2", 10)], [apart("a", "b")], seating);
    expect(find(s, "apart_violated")).toBeDefined();
  });
});

describe("computeQualityScore", () => {
  it("is a perfect-ish score when everyone is seated with no violations", () => {
    const guests = [g("a"), g("b")];
    const tables = [t("t1", 10)];
    const seating = { a: "t1", b: "t1" };
    const violations = computeViolations(guests, tables, [], seating);
    const score = computeQualityScore(guests, tables, [], seating, violations);
    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("drops when guests are left unassigned", () => {
    const guests = [g("a"), g("b"), g("c")];
    const tables = [t("t1", 10)];
    const full = { a: "t1", b: "t1", c: "t1" };
    const partial = { a: "t1" };
    const scoreFull = computeQualityScore(guests, tables, [], full, computeViolations(guests, tables, [], full));
    const scorePartial = computeQualityScore(guests, tables, [], partial, computeViolations(guests, tables, [], partial));
    expect(scorePartial).toBeLessThan(scoreFull);
  });
});
