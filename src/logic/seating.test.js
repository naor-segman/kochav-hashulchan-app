import { describe, it, expect } from "vitest";
import { autoAssign, computeViolations } from "./seating.js";

// Helpers to build fixtures concisely.
const g = (id, extra = {}) => ({ id, name: id, side: "bride", group: "משפחה", count: 1, ...extra });
const t = (id, capacity) => ({ id, name: id, capacity });
const together = (a, b) => ({ id: `tog-${a}-${b}`, type: "together", guestA: a, guestB: b });
const apart = (a, b) => ({ id: `apt-${a}-${b}`, type: "apart", guestA: a, guestB: b });

// Count how many seats a table holds in a seating map.
const seatsAt = (seating, guests, tableId) =>
  guests.filter(x => seating[x.id] === tableId).reduce((s, x) => s + (x.count || 1), 0);

describe("autoAssign", () => {
  it("returns the locked seating unchanged when there are no guests or no tables", () => {
    expect(autoAssign([], [t("t1", 10)], [])).toEqual({});
    expect(autoAssign([g("a")], [], [])).toEqual({});
    expect(autoAssign([], [], [], { a: "t1" })).toEqual({ a: "t1" });
  });

  it("seats every guest when capacity is sufficient", () => {
    const guests = [g("a"), g("b"), g("c")];
    const tables = [t("t1", 10)];
    const seating = autoAssign(guests, tables, []);
    for (const guest of guests) expect(seating[guest.id]).toBe("t1");
  });

  it("never exceeds a table's capacity (respects group size via count)", () => {
    const guests = [g("a", { count: 6 }), g("b", { count: 6 })];
    const tables = [t("t1", 8), t("t2", 8)];
    const seating = autoAssign(guests, tables, []);
    expect(seatsAt(seating, guests, "t1")).toBeLessThanOrEqual(8);
    expect(seatsAt(seating, guests, "t2")).toBeLessThanOrEqual(8);
    // 6 + 6 can't share an 8-seat table → they must be split
    expect(seating.a).not.toBe(seating.b);
  });

  it("keeps 'together' guests at the same table", () => {
    const guests = [g("a"), g("b"), g("c")];
    const tables = [t("t1", 10), t("t2", 10)];
    const seating = autoAssign(guests, tables, [together("a", "b")]);
    expect(seating.a).toBe(seating.b);
  });

  it("never seats 'apart' guests at the same table", () => {
    const guests = [g("a"), g("b")];
    const tables = [t("t1", 10), t("t2", 10)];
    const seating = autoAssign(guests, tables, [apart("a", "b")]);
    expect(seating.a).toBeDefined();
    expect(seating.b).toBeDefined();
    expect(seating.a).not.toBe(seating.b);
  });

  it("preserves locked seating assignments", () => {
    const guests = [g("a"), g("b"), g("c")];
    const tables = [t("t1", 10), t("t2", 10)];
    const seating = autoAssign(guests, tables, [], { a: "t2" });
    expect(seating.a).toBe("t2");
  });

  it("seats an unlocked guest with a locked partner at the locked table", () => {
    const guests = [g("a"), g("b")];
    const tables = [t("t1", 10), t("t2", 10)];
    // a is locked to t2, b must join a (together)
    const seating = autoAssign(guests, tables, [together("a", "b")], { a: "t2" });
    expect(seating.a).toBe("t2");
    expect(seating.b).toBe("t2");
  });

  it("does not violate apart even when clusters compete for tables", () => {
    const guests = [g("a"), g("b"), g("c"), g("d")];
    const tables = [t("t1", 2), t("t2", 2)];
    const constraints = [together("a", "b"), apart("a", "c")];
    const seating = autoAssign(guests, tables, constraints);
    // a & b together
    expect(seating.a).toBe(seating.b);
    // a & c not together (if both seated)
    if (seating.a && seating.c) expect(seating.a).not.toBe(seating.c);
  });
});

describe("computeViolations", () => {
  const guests = [g("a", { name: "אבי" }), g("b", { name: "בני" })];
  const tables = [t("t1", 10), t("t2", 10)];

  it("reports no violations for a valid seating", () => {
    const seating = { a: "t1", b: "t1" };
    expect(computeViolations(guests, tables, [], seating)).toHaveLength(0);
  });

  it("flags 'together' guests seated at different tables", () => {
    const seating = { a: "t1", b: "t2" };
    const v = computeViolations(guests, tables, [together("a", "b")], seating);
    expect(v.some(x => x.type === "together")).toBe(true);
  });

  it("flags a 'together' pair where one guest is unseated", () => {
    const seating = { a: "t1" };
    const v = computeViolations(guests, tables, [together("a", "b")], seating);
    expect(v.some(x => x.type === "together")).toBe(true);
  });

  it("flags 'apart' guests seated at the same table", () => {
    const seating = { a: "t1", b: "t1" };
    const v = computeViolations(guests, tables, [apart("a", "b")], seating);
    expect(v.some(x => x.type === "apart")).toBe(true);
  });

  it("flags capacity overflow counting group sizes", () => {
    const big = [g("a", { count: 7 }), g("b", { count: 7 })];
    const seating = { a: "t1", b: "t1" };
    const v = computeViolations(big, [t("t1", 10)], [], seating);
    expect(v.some(x => x.type === "capacity")).toBe(true);
  });

  it("ignores constraints that reference a missing guest", () => {
    const seating = { a: "t1" };
    const v = computeViolations(guests, tables, [together("a", "ghost")], seating);
    expect(v).toHaveLength(0);
  });
});
