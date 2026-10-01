import { describe, it, expect } from "vitest";
import { autoAssign, computeViolations } from "./seating.js";

// סב34a/b — families split although a seating with every family whole existed.
//
// The table sort was affinity alone, and between two empty tables it kept list
// order: a small family took the roomy table a later, larger family needed
// whole. Measured on the original engine: 52 of 1,908 feasible random events
// split a family that brute force could seat whole; with the best-fit
// tie-break and the keep-if-better second opinions, 18.

const G = (id, count) => ({ id, name: id, count, rsvp: "confirmed" });
const T = (id, capacity) => ({ id, name: id, capacity });
const tog = (a, b) => ({ id: a + "_" + b, type: "together", guestA: a, guestB: b });

describe("best fit: a family takes the table it fits, not the first empty one", () => {
  // Tables 10 and 6. Families of 6, 5 and 5 (each two rows bound together).
  // Old engine: the 6 took the first empty table (10), leaving 4 + 6 — and
  // the second 5 could not sit whole anywhere. Best fit: 6 → the 6-table,
  // 5 + 5 → the 10-table. Everybody whole.
  it("seats 6/5/5 into 10 + 6 with no family split", () => {
    const guests = [G("a1", 3), G("a2", 3), G("b1", 3), G("b2", 2), G("c1", 2), G("c2", 3)];
    const constraints = [tog("a1", "a2"), tog("b1", "b2"), tog("c1", "c2")];
    const tables = [T("T10", 10), T("T6", 6)];
    const out = autoAssign(guests, tables, constraints);
    expect(guests.every(g => out[g.id])).toBe(true);
    expect(computeViolations(guests, tables, constraints, out)).toEqual([]);
  });
});

// A deterministic generator, so a failure is reproducible from its seed.
function lcg(seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return { rnd, ri: (a, b) => a + Math.floor(rnd() * (b - a + 1)) };
}

function makeEvent(seed, { oversized = false, apart = false } = {}) {
  const { rnd, ri } = lcg(seed);
  const nt = ri(2, 4);
  const tables = [...Array(nt)].map((_, i) => T("t" + i, ri(8, 12)));
  const cap = tables.reduce((a, t) => a + t.capacity, 0);
  const guests = [], constraints = [], families = [];
  let seats = 0, gid = 0;
  for (;;) {
    const k = oversized && rnd() < 0.12 ? ri(4, 6) : ri(1, 3);
    const rows = [...Array(k)].map(() => G("g" + gid++, ri(1, 4)));
    const cs = rows.reduce((a, r) => a + r.count, 0);
    if (seats + cs > cap * ri(80, 100) / 100) break;
    seats += cs;
    guests.push(...rows);
    families.push({ ids: rows.map(r => r.id), seats: cs });
    for (let i = 1; i < rows.length; i++) constraints.push(tog(rows[0].id, rows[i].id));
  }
  if (apart && guests.length > 1) {
    for (let i = ri(0, 3); i > 0; i--) {
      const a = guests[ri(0, guests.length - 1)].id, b = guests[ri(0, guests.length - 1)].id;
      if (a !== b) constraints.push({ id: "x" + i, type: "apart", guestA: a, guestB: b });
    }
  }
  return { tables, guests, constraints, families };
}

// Can every family sit whole? Exhaustive, largest first — small instances only.
function feasible(tables, families) {
  const free = tables.map(t => t.capacity);
  const order = [...families].sort((a, b) => b.seats - a.seats);
  const go = i => {
    if (i === order.length) return true;
    for (let t = 0; t < free.length; t++) {
      if (free[t] < order[i].seats) continue;
      free[t] -= order[i].seats;
      const ok = go(i + 1);
      free[t] += order[i].seats;
      if (ok) return true;
    }
    return false;
  };
  return go(0);
}

const splitOrStanding = (families, seating) =>
  families.filter(f => f.ids.some(id => !seating[id]) || new Set(f.ids.map(id => seating[id])).size > 1);

describe("seeded fuzz with brute-force feasibility (סב34b)", () => {
  // 600 seeds of the triage generator. Measured on these exact seeds:
  // original engine 14 split events, this one 5. The bound is the measured
  // value — a regression in the table choice shows up as a higher number.
  it("splits a family in at most 5 of the feasible events", () => {
    let feasibleCount = 0, bad = 0;
    for (let s = 1; s <= 600; s++) {
      const { tables, guests, constraints, families } = makeEvent(s * 7919);
      if (!feasible(tables, families)) continue;
      feasibleCount++;
      const out = autoAssign(guests, tables, constraints);
      if (splitOrStanding(families, out).length) bad++;
    }
    expect(feasibleCount).toBeGreaterThan(500);
    expect(bad).toBeLessThanOrEqual(5);
  });

  // The second opinions are kept only when they seat at least as many and
  // split fewer — so on any event, whatever else changes, the engine's own
  // promises still hold: no table over capacity, no "apart" pair together,
  // and oversized families still seated as densely as before.
  it("never breaks capacity or an apart pair, with oversized families and apart constraints", () => {
    for (let s = 1; s <= 400; s++) {
      const { tables, guests, constraints } = makeEvent(s * 104729, { oversized: true, apart: true });
      const out = autoAssign(guests, tables, constraints);
      const v = computeViolations(guests, tables, constraints, out);
      expect(v.filter(x => x.type === "capacity" || x.type === "apart"), "seed " + s).toEqual([]);
    }
  });

  // סב34a — families too big for any table. Seated LAST as a second opinion,
  // they fill what is left instead of taking first pick. Measured on these
  // 400 seeds: original engine 9,102 seats / 190 split families; best fit
  // alone 9,113 / 187; with the oversized-last opinion 9,114 / 182.
  it("oversized families: seats at least 9,114 and splits at most 182 over 400 seeds", () => {
    let seats = 0, split = 0;
    for (let s = 1; s <= 400; s++) {
      const { tables, guests, constraints, families } = makeEvent(s * 104729, { oversized: true, apart: true });
      const out = autoAssign(guests, tables, constraints);
      seats += guests.reduce((a, g) => a + (out[g.id] ? g.count : 0), 0);
      split += families.filter(f => new Set(f.ids.map(id => out[id] || "")).size > 1).length;
    }
    expect(seats).toBeGreaterThanOrEqual(9114);
    expect(split).toBeLessThanOrEqual(182);
  });
});
