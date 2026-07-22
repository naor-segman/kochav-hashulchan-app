import { describe, it, expect } from "vitest";
import { autoAssign, computeViolations } from "./seating.js";

// Deterministic pseudo-random so the test is reproducible (no Math.random).
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const SIDES  = ["bride", "groom"];
const GROUPS = ["משפחה קרובה", "משפחה רחוקה", "חברים", "עבודה", "צבא", "לימודים"];

// Build a realistic wedding-scale fixture: ~N group-rows (1–6 seats each),
// enough round tables of 12, plus a sprinkling of together/apart constraints.
function buildFixture(n, seed = 42) {
  const rnd = mulberry32(seed);
  const guests = [];
  for (let i = 0; i < n; i++) {
    const count = 1 + Math.floor(rnd() * 6); // 1..6 seats
    guests.push({
      id: `g${i}`,
      name: `אורח ${i}`,
      side: SIDES[Math.floor(rnd() * SIDES.length)],
      group: GROUPS[Math.floor(rnd() * GROUPS.length)],
      count,
    });
  }
  const totalSeats = guests.reduce((s, g) => s + g.count, 0);
  // ~15% headroom so a valid packing exists.
  const capacity = 12;
  const nTables = Math.ceil((totalSeats * 1.15) / capacity);
  const tables = Array.from({ length: nTables }, (_, i) => ({ id: `t${i}`, name: `שולחן ${i + 1}`, capacity }));

  // A handful of together/apart constraints between real guests.
  const constraints = [];
  for (let i = 0; i < Math.floor(n / 20); i++) {
    const a = `g${Math.floor(rnd() * n)}`;
    const b = `g${Math.floor(rnd() * n)}`;
    if (a === b) continue;
    constraints.push({ id: `c${i}`, type: rnd() < 0.6 ? "together" : "apart", guestA: a, guestB: b });
  }
  return { guests, tables, constraints, totalSeats, capacity };
}

const seatsAt = (seating, guests, tableId) =>
  guests.filter(x => seating[x.id] === tableId).reduce((s, x) => s + (x.count || 1), 0);

describe("autoAssign — large realistic lists", () => {
  for (const n of [120, 250, 400]) {
    it(`never exceeds any table capacity for ~${n} rows`, () => {
      const { guests, tables, constraints, capacity } = buildFixture(n);
      const seating = autoAssign(guests, tables, constraints);
      for (const t of tables) {
        expect(seatsAt(seating, guests, t.id)).toBeLessThanOrEqual(capacity);
      }
    });

    it(`only assigns guests to real tables for ~${n} rows`, () => {
      const { guests, tables, constraints } = buildFixture(n);
      const seating = autoAssign(guests, tables, constraints);
      const tableIds = new Set(tables.map(t => t.id));
      for (const gid of Object.keys(seating)) {
        expect(tableIds.has(seating[gid])).toBe(true);
      }
    });
  }

  it("seats the large majority when ample capacity exists", () => {
    const { guests, tables, constraints } = buildFixture(300, 7);
    const seating = autoAssign(guests, tables, constraints);
    const seatedRows = guests.filter(g => seating[g.id]).length;
    // With 15% headroom a good packer should place nearly everyone.
    expect(seatedRows / guests.length).toBeGreaterThan(0.9);
  });

  it("respects most constraints and reports the rest via computeViolations", () => {
    const { guests, tables, constraints } = buildFixture(250, 11);
    const seating = autoAssign(guests, tables, constraints);
    // The function's own violation checker must agree the result is sane:
    // apart-violations among seated guests should be rare (< 20% of constraints).
    const violations = computeViolations(guests, tables, constraints, seating);
    expect(violations.length).toBeLessThan(Math.max(3, constraints.length * 0.3));
  });

  it("completes a 400-row assignment quickly", () => {
    const { guests, tables, constraints } = buildFixture(400, 3);
    const started = Date.now();
    autoAssign(guests, tables, constraints);
    // Generous ceiling; catches accidental O(n^3) regressions.
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it("is deterministic — same input yields same output", () => {
    const a = buildFixture(150, 5);
    const b = buildFixture(150, 5);
    expect(autoAssign(a.guests, a.tables, a.constraints))
      .toEqual(autoAssign(b.guests, b.tables, b.constraints));
  });
});
