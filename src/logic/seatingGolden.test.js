import { describe, it, expect } from "vitest";
import { autoAssign } from "./seating.js";

// סב58 — the affinity/best-fit keys are computed once per table before the
// sort instead of inside the comparator. A pure performance change: the output
// must be IDENTICAL. This pins a digest of autoAssign's output over 300 seeded
// events (sides, groups, together/apart, locks, closed tables, sketch
// positions, tight and roomy capacity), recorded from the engine BEFORE the
// refactor (commit 930adae). Any change to which table anyone lands on changes
// the digest.
//
// If a deliberate behaviour change lands, re-record the digest in the same
// commit and say so — this test is a tripwire for unintended ones.

function lcg(seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return { rnd, ri: (a, b) => a + Math.floor(rnd() * (b - a + 1)) };
}

const SIDES = ["כלה", "חתן", "משותף"];
const GROUPS = ["משפחה", "חברים", "עבודה", "צבא"];

function makeEvent(seed) {
  const { rnd, ri } = lcg(seed);
  const nt = ri(3, 9);
  const tables = [...Array(nt)].map((_, i) => ({ id: "t" + i, name: "T" + i, capacity: ri(6, 12) }));
  const cap = tables.reduce((a, t) => a + t.capacity, 0);
  const target = cap * ri(70, 115) / 100;
  const guests = [], constraints = [];
  let seats = 0, gid = 0;
  while (seats < target) {
    const k = rnd() < 0.1 ? ri(4, 6) : ri(1, 3);
    const side = SIDES[ri(0, 2)], group = GROUPS[ri(0, 3)];
    const rows = [...Array(k)].map(() => ({ id: "g" + gid++, name: "x", side, group, count: ri(1, 4) }));
    rows.forEach(r => { seats += r.count; });
    guests.push(...rows);
    for (let i = 1; i < rows.length; i++) constraints.push({ id: "c" + gid + "_" + i, type: "together", guestA: rows[0].id, guestB: rows[i].id });
  }
  for (let i = ri(0, 4); i > 0; i--) {
    const a = guests[ri(0, guests.length - 1)].id, b = guests[ri(0, guests.length - 1)].id;
    if (a !== b) constraints.push({ id: "a" + i, type: "apart", guestA: a, guestB: b });
  }
  const locked = {};
  for (let i = ri(0, 3); i > 0; i--) locked[guests[ri(0, guests.length - 1)].id] = tables[ri(0, nt - 1)].id;
  const closed = rnd() < 0.2 ? [tables[ri(0, nt - 1)].id] : [];
  const positions = rnd() < 0.5
    ? Object.fromEntries(tables.map(t => [t.id, { x: rnd(), y: rnd() }]))
    : null;
  return { guests, tables, constraints, locked, positions, closed };
}

// FNV-1a over the JSON, small and dependency-free.
function digest(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

describe("autoAssign output is pinned across seeded events (סב58 refactor)", () => {
  it("matches the digest recorded before the precompute", () => {
    const outs = [];
    for (let s = 1; s <= 300; s++) {
      const { guests, tables, constraints, locked, positions, closed } = makeEvent(s * 48271);
      const out = autoAssign(guests, tables, constraints, locked, positions, closed);
      outs.push(guests.map(g => out[g.id] || "-").join(","));
    }
    expect(digest(outs.join("|"))).toBe("2100c2b9");
  });
});
