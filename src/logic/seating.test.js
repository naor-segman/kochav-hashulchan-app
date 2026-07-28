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

  // Regression for the "seatUnassigned" overbooking fix: when a guest's seat is
  // preserved via the locked base AND that guest is in the guests list, its seats
  // count toward capacity, so a new guest can't overbook the table.
  it("counts a locked guest's seats toward capacity (no overbooking)", () => {
    const guests = [g("big", { count: 8 }), g("new", { count: 4 })];
    const tables = [t("t1", 10), t("t2", 10)];
    const seating = autoAssign(guests, tables, [], { big: "t1" });
    expect(seating.big).toBe("t1");
    // t1 has 8 of 10 used → 4 won't fit → new must go to t2, not overbook t1
    expect(seatsAt(seating, guests, "t1")).toBeLessThanOrEqual(10);
    expect(seating.new).toBe("t2");
  });

  // Documents the footgun the overbooking bug hit: a locked seat whose guest is
  // absent from `guests` is NOT counted (autoAssign only knows guests it receives).
  it("does not count a locked seat when its guest is absent from the guests list", () => {
    const guests = [g("new", { count: 4 })]; // 'ghost' is locked at t1 but not passed in
    const tables = [t("t1", 10)];
    const seating = autoAssign(guests, tables, [], { ghost: "t1" });
    expect(seating.ghost).toBe("t1");   // preserved
    expect(seating.new).toBe("t1");     // ghost's seats unknown → t1 looks empty
  });

  it("packs an oversized 'together' group into the fewest tables instead of scattering it", () => {
    // 12 people chained together (one cluster of 12) with only 10-seat tables:
    // they physically can't all share a table, but should stay as grouped as
    // possible — not spread one-per-table across the room.
    const guests = Array.from({ length: 12 }, (_, i) => g(`p${i}`));
    const constraints = Array.from({ length: 11 }, (_, i) => together(`p${i}`, `p${i + 1}`));
    const tables = [t("t1", 10), t("t2", 10), t("t3", 10), t("t4", 10)];
    const seating = autoAssign(guests, tables, constraints);
    guests.forEach(gu => expect(seating[gu.id]).toBeDefined());           // everyone seated
    tables.forEach(tb => expect(seatsAt(seating, guests, tb.id)).toBeLessThanOrEqual(10)); // no overbooking
    const tablesUsed = new Set(guests.map(gu => seating[gu.id]));
    expect(tablesUsed.size).toBeLessThanOrEqual(2);                       // 12 → 2 tables (10+2), not scattered
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

describe("autoAssign — locked tables pin their occupants", () => {
  // The screen turns a locked TABLE into locked seating entries before calling
  // autoAssign. This pins the contract that entry is honoured, so a recompute
  // can never scatter a head table again.
  it("keeps every guest sitting at a locked table exactly where they are", () => {
    const guests = [
      { id: "p1", name: "אמא",  side: "bride", group: "הורים", count: 1 },
      { id: "p2", name: "אבא",  side: "bride", group: "הורים", count: 1 },
      { id: "f1", name: "חבר1", side: "groom", group: "חברים", count: 1 },
      { id: "f2", name: "חבר2", side: "groom", group: "חברים", count: 1 },
    ];
    const tables = [
      { id: "head", name: "ראשי", capacity: 4 },
      { id: "t2",   name: "2",    capacity: 4 },
    ];
    // "head" is locked, so its two occupants arrive as locked seating.
    const lockedSeating = { p1: "head", p2: "head" };

    const out = autoAssign(guests, tables, [], lockedSeating);

    expect(out.p1).toBe("head");
    expect(out.p2).toBe("head");
    expect(Object.keys(out)).toHaveLength(4);
  });

  it("counts a locked table's occupants against its capacity", () => {
    const guests = [
      { id: "a", name: "a", side: "bride", group: "g", count: 3 },
      { id: "b", name: "b", side: "bride", group: "g", count: 3 },
      { id: "c", name: "c", side: "groom", group: "g", count: 3 },
    ];
    const tables = [
      { id: "locked", name: "נעול", capacity: 4 },
      { id: "free",   name: "פנוי", capacity: 10 },
    ];
    const out = autoAssign(guests, tables, [], { a: "locked" });

    expect(out.a).toBe("locked");
    // a takes 3 of the locked table's 4 seats — nobody else fits there.
    const atLocked = Object.entries(out).filter(([, t]) => t === "locked").map(([id]) => id);
    expect(atLocked).toEqual(["a"]);
  });
});

// ── Regressions found by the full-codebase audit (28.7) ──────────────────────
// These pin paths that a mutation run showed were completely unconstrained:
// deleting the capacity check or the apart check in the individual fallback
// left all 206 tests green.

describe("cluster members that are already pinned", () => {
  it("joins the rest of the cluster TO the pinned guest, never the reverse", () => {
    // A is locked to the head table; together(A,B) and together(B,C) chain C in.
    // seatCluster used to re-seat the whole cluster — including the already
    // pinned B — and tore B off the locked table it had just been pinned to.
    const seating = autoAssign(
      [g("A"), g("B"), g("C"), g("X1"), g("X2"), g("X3")],
      [t("HEAD", 3), t("T2", 10)],
      [
        { id: "c1", type: "together", guestA: "A", guestB: "B" },
        { id: "c2", type: "together", guestA: "B", guestB: "C" },
      ],
      { A: "HEAD" }
    );
    expect(seating.A).toBe("HEAD");
    expect(seating.B).toBe("HEAD");
    expect(seating.C).toBe("HEAD");
  });

  it("does not double-charge a pinned guest's seats against the table", () => {
    // The double push made a 4-seat table read as full with 3 people on it, so
    // D was reported unseated while a real chair stood empty.
    const seating = autoAssign(
      [g("A"), g("B"), g("C"), g("D")],
      [t("t1", 4)],
      [
        { id: "c1", type: "together", guestA: "A", guestB: "B" },
        { id: "c2", type: "together", guestA: "B", guestB: "C" },
      ],
      { A: "t1" }
    );
    expect(seating.D).toBe("t1");
    expect(Object.keys(seating)).toHaveLength(4);
  });
});

describe("the individual-guest fallback obeys the same rules as clustering", () => {
  it("never exceeds capacity", () => {
    // Three 5-seat rows, one 10-seat table: the third must NOT be seated.
    const seating = autoAssign(
      [g("a", { count: 5 }), g("b", { count: 5 }), g("c", { count: 5 })],
      [t("t1", 10)], []
    );
    const used = ["a", "b", "c"].filter(id => seating[id] === "t1").length * 5;
    expect(used).toBeLessThanOrEqual(10);
  });

  it("still honours an apart constraint when guests fall through to it", () => {
    // Crowded room — exactly the case where the constraint matters most.
    const seating = autoAssign(
      [g("mum", { count: 2 }), g("dad", { count: 2 }), g("x", { count: 2 }), g("y", { count: 2 })],
      [t("t1", 4), t("t2", 4)],
      [{ id: "c1", type: "apart", guestA: "mum", guestB: "dad" }]
    );
    if (seating.mum && seating.dad) expect(seating.mum).not.toBe(seating.dad);
  });
});

// A "together" cluster can contain two guests the host locked to DIFFERENT
// tables. That is a contradiction the engine cannot resolve — it is not allowed
// to move either of them — and the code picks one pinned table arbitrarily
// (`pinned[0]`) with no reconciliation. Investigated after a review flagged the
// branch as untested: across several shapes it behaves sensibly, so these pin
// the guarantees that actually matter rather than "fixing" something that is
// not demonstrably broken. What must never happen is the rest of the family
// being scattered, or left standing, because two locks disagree.
describe("a together-cluster whose locked members sit at different tables", () => {
  const family = [
    g("mom"), g("dad"),
    g("k1"), g("k2"), g("k3"), g("k4"),
  ];
  const bound = [
    together("mom", "k1"), together("dad", "k1"),
    together("k1", "k2"), together("k2", "k3"), together("k3", "k4"),
  ];

  it("seats everyone even though the two locks contradict each other", () => {
    const seating = autoAssign(family, [t("t1", 3), t("t2", 10)], bound, { mom: "t1", dad: "t2" });
    for (const id of ["k1", "k2", "k3", "k4"]) expect(seating[id]).toBeTruthy();
  });

  it("keeps the unlocked members together instead of scattering them", () => {
    const seating = autoAssign(family, [t("t1", 3), t("t2", 10)], bound, { mom: "t1", dad: "t2" });
    const kidTables = new Set(["k1", "k2", "k3", "k4"].map(id => seating[id]));
    expect(kidTables.size).toBe(1);
  });

  it("sends them to a table that can actually hold them all", () => {
    // t1 has room for two more; the four siblings must not be squeezed in.
    const seating = autoAssign(family, [t("t1", 3), t("t2", 10)], bound, { mom: "t1", dad: "t2" });
    expect(seatsAt(seating, family, "t1")).toBeLessThanOrEqual(3);
    expect(seatsAt(seating, family, "t2")).toBeLessThanOrEqual(10);
  });

  it("works the same way when the roomy table is the other one", () => {
    const seating = autoAssign(family, [t("t1", 10), t("t2", 3)], bound, { mom: "t1", dad: "t2" });
    for (const id of ["k1", "k2", "k3", "k4"]) expect(seating[id]).toBeTruthy();
    expect(new Set(["k1", "k2", "k3", "k4"].map(id => seating[id])).size).toBe(1);
    expect(seatsAt(seating, family, "t2")).toBeLessThanOrEqual(3);
  });

  // The one violation that IS unavoidable must be reported, not swallowed:
  // the host needs to see that their own two locks cannot both be honoured.
  it("still reports the contradiction between the two locked guests", () => {
    const seating = autoAssign(family, [t("t1", 3), t("t2", 10)], bound, { mom: "t1", dad: "t2" });
    const v = computeViolations(family, [t("t1", 3), t("t2", 10)], bound, seating);
    expect(v.some(x => x.type === "together")).toBe(true);
  });

  // The regression this describe block was written for. Before the fix the
  // engine added a violation of its own: with mom on the roomy table and dad on
  // the tight one, k1 was pinned to dad (last constraint in the list wins), the
  // siblings could not follow, and the family split one-and-three.
  it("adds no violation of its own beyond the one the two locks force", () => {
    for (const [c1, c2] of [[3, 10], [10, 3]]) {
      const tables  = [t("t1", c1), t("t2", c2)];
      const seating = autoAssign(family, tables, bound, { mom: "t1", dad: "t2" });
      const broken  = computeViolations(family, tables, bound, seating)
        .filter(v => v.type === "together");
      expect(broken).toHaveLength(1);   // mom-vs-dad only, whichever side loses
    }
  });

  it("does not break an apart constraint while resolving the contradiction", () => {
    const guests = [...family, g("foe")];
    const cons   = [...bound, apart("k1", "foe")];
    const seating = autoAssign(guests, [t("t1", 3), t("t2", 10)], cons, { mom: "t1", dad: "t2", foe: "t2" });
    if (seating.k1 && seating.foe) expect(seating.k1).not.toBe(seating.foe);
  });
});
