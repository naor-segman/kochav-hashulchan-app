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

// affinityScore is the entire "smart" in smart seating, and it was completely
// unpinned: an audit inverted its sign — making the engine deliberately seat
// people with the OTHER side and the OTHER group — and all 334 tests stayed
// green. Every other assertion in this file is about capacity, locks and
// constraints; none was about who ends up next to whom, which is the product.
describe("affinityScore — who ends up next to whom", () => {
  it("seats a guest with their own side and group rather than the opposite one", () => {
    // Two tables, each already holding one anchor. The newcomer shares side and
    // group with the anchor at t1 and neither with the anchor at t2, and both
    // tables have exactly one seat left, so the engine has to choose.
    const guests = [
      g("anchorSame",  { side: "bride", group: "משפחה" }),
      g("anchorOther", { side: "groom", group: "עבודה" }),
      g("newcomer",    { side: "bride", group: "משפחה" }),
    ];
    const tables = [t("t1", 2), t("t2", 2)];
    const seating = autoAssign(guests, tables, [], { anchorSame: "t1", anchorOther: "t2" });
    expect(seating.newcomer).toBe("t1");
  });

  it("prefers the same side when the group does not match either table", () => {
    const guests = [
      g("brideAnchor", { side: "bride", group: "חברים" }),
      g("groomAnchor", { side: "groom", group: "עבודה" }),
      g("newcomer",    { side: "bride", group: "שכנים" }),
    ];
    const tables = [t("t1", 2), t("t2", 2)];
    const seating = autoAssign(guests, tables, [], { brideAnchor: "t1", groomAnchor: "t2" });
    expect(seating.newcomer).toBe("t1");
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

  // A violation is a CONFLICT, not "not finished yet". The count used to jump
  // 0 → 1 the moment the host seated the FIRST member of a together pair,
  // because a half-seated pair counted and an entirely unseated pair did not.
  // Seating a guest is progress; it must never raise the violation count.
  it("does not count a 'together' pair that is only half seated", () => {
    const v = computeViolations(guests, tables, [together("a", "b")], { a: "t1" });
    expect(v.some(x => x.type === "together")).toBe(false);
  });

  it("keeps the together count monotone as guests get seated", () => {
    const c = [together("a", "b")];
    const none = computeViolations(guests, tables, c, {}).filter(x => x.type === "together").length;
    const half = computeViolations(guests, tables, c, { a: "t1" }).filter(x => x.type === "together").length;
    const both = computeViolations(guests, tables, c, { a: "t1", b: "t1" }).filter(x => x.type === "together").length;
    const split = computeViolations(guests, tables, c, { a: "t1", b: "t2" }).filter(x => x.type === "together").length;
    expect([none, half, both]).toEqual([0, 0, 0]);
    expect(split).toBe(1);
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

describe("seatClusterBestEffort obeys the same rules as clustering", () => {
  // This block used to be named for the individual-guest fallback that ran
  // after the cluster passes. That fallback was dead code and has been removed
  // — and its "still honours an apart constraint" test never entered it, and
  // asserted conditionally (`if (seating.mum && seating.dad)`), so it passed
  // whether or not the guard existed.
  //
  // The live path is seatClusterBestEffort: it packs any `together` cluster
  // too large for a single table. Deleting its apart guard left the whole
  // suite green while a fuzz run immediately produced 849 engine-created apart
  // violations. These two enter it and assert unconditionally.

  it("never exceeds capacity", () => {
    // Three 5-seat rows, one 10-seat table: the third must NOT be seated.
    const seating = autoAssign(
      [g("a", { count: 5 }), g("b", { count: 5 }), g("c", { count: 5 })],
      [t("t1", 10)], []
    );
    const used = ["a", "b", "c"].filter(id => seating[id] === "t1").length * 5;
    expect(used).toBeLessThanOrEqual(10);
  });

  it("keeps an apart pair apart while packing an oversized together cluster", () => {
    // One together-chain of 8 seats against 4-seat tables, so the cluster
    // cannot fit anywhere and MUST go through bestEffort. The chain drags an
    // apart pair along with it — the exact collision the guard exists for.
    const seating = autoAssign(
      [g("a", { count: 2 }), g("b", { count: 2 }), g("c", { count: 2 }), g("d", { count: 2 })],
      [t("t1", 4), t("t2", 4), t("t3", 4)],
      [
        { id: "c1", type: "together", guestA: "a", guestB: "b" },
        { id: "c2", type: "together", guestA: "b", guestB: "c" },
        { id: "c3", type: "together", guestA: "c", guestB: "d" },
        { id: "c4", type: "apart",    guestA: "a", guestB: "c" },
      ]
    );
    // Unconditional: everyone fits in 12 seats, so everyone must be seated.
    expect(Object.keys(seating).sort()).toEqual(["a", "b", "c", "d"]);
    expect(seating.a).not.toBe(seating.c);
  });

  it("never lets bestEffort overfill a table", () => {
    const seating = autoAssign(
      [g("a", { count: 3 }), g("b", { count: 3 }), g("c", { count: 3 })],
      [t("t1", 4), t("t2", 4)],
      [
        { id: "c1", type: "together", guestA: "a", guestB: "b" },
        { id: "c2", type: "together", guestA: "b", guestB: "c" },
      ]
    );
    for (const tid of ["t1", "t2"]) {
      const used = ["a", "b", "c"].filter(id => seating[id] === tid).length * 3;
      expect(used).toBeLessThanOrEqual(4);
    }
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

// ── The venue sketch actually changes the answer ─────────────────────────────
// A family too big for one table has to spill. Which table it spills to used to
// be "whichever is emptiest", i.e. whichever the host happened to create with a
// bigger capacity — which can be at the far end of the hall. Once tables are
// placed on the sketch, the spill goes to the table NEXT TO them.
//
// Every fixture here is built so the two rules disagree: the nearest table is
// deliberately the SMALLER one, so a pass cannot be explained by emptiest-first.
describe("autoAssign — position-aware spill", () => {
  // 4 guests × 4 seats = 16, more than any single table holds.
  const family = ["f1", "f2", "f3", "f4"].map(id => g(id, { count: 4 }));
  const bound  = [together("f1", "f2"), together("f2", "f3"), together("f3", "f4")];

  // anchor is picked first (emptiest, ties → first listed). far is the emptiest
  // of what is left; near is smaller but adjacent to the anchor.
  const tables = [t("anchor", 10), t("far", 10), t("near", 8)];
  const positions = {
    anchor: { x: 0.10, y: 0.10 },
    near:   { x: 0.15, y: 0.12 },
    far:    { x: 0.90, y: 0.90 },
  };

  const spillTable = seating =>
    [...new Set(Object.values(seating))].find(id => id !== seating.f1);

  it("without a sketch, spills to the emptiest table (unchanged behaviour)", () => {
    const seating = autoAssign(family, tables, bound);
    expect(seating.f1).toBe("anchor");
    expect(spillTable(seating)).toBe("far");
  });

  it("with a sketch, spills to the NEAREST table even though it is smaller", () => {
    const seating = autoAssign(family, tables, bound, {}, positions);
    expect(seating.f1).toBe("anchor");
    expect(spillTable(seating)).toBe("near");
  });

  it("seats the whole family either way (this fixture has room for everyone)", () => {
    // Named honestly: 16 seats into 28 of capacity, so nobody can be left over
    // whatever the engine picks. It is NOT evidence that proximity is free —
    // that claim is tested by "proximity never costs a seat" below, on a
    // fixture where the old engine really did leave a guest standing.
    for (const p of [null, positions]) {
      const seating = autoAssign(family, tables, bound, {}, p);
      for (const guest of family) expect(seating[guest.id]).toBeTruthy();
    }
  });

  it("ignores a half-drawn sketch: an unplaced table never beats a placed one", () => {
    // `near` is the only table with coordinates besides the anchor, so even
    // though `far` is emptiest it must lose to the one we can actually measure.
    const partial = { anchor: positions.anchor, near: positions.near };
    const seating = autoAssign(family, tables, bound, {}, partial);
    expect(spillTable(seating)).toBe("near");
  });

  it("falls back to emptiest-first when the sketch has no usable coordinates", () => {
    const junk = { anchor: { x: null, y: 0.1 }, near: {}, far: { x: "0.9", y: "0.9" } };
    const seating = autoAssign(family, tables, bound, {}, junk);
    expect(spillTable(seating)).toBe("far");
  });

  it("respects capacity and apart constraints while preferring the near table", () => {
    const guests = [...family, g("foe")];
    const cons   = [...bound, apart("f3", "foe")];
    const seating = autoAssign(guests, tables, cons, { foe: "near" }, positions);
    if (seating.f3) expect(seating.f3).not.toBe("near");
    for (const tbl of tables) {
      expect(seatsAt(seating, guests, tbl.id)).toBeLessThanOrEqual(tbl.capacity);
    }
  });
});

// Three near-misses the first version of the rule let through, each caught by
// mutating the engine and watching the suite stay green. They are separate
// fixtures because each needs the two rules to disagree in a different way.
describe("autoAssign — position-aware spill, edge cases", () => {
  const family = ["f1", "f2", "f3", "f4"].map(id => g(id, { count: 4 }));
  const bound  = [together("f1", "f2"), together("f2", "f3"), together("f3", "f4")];
  const spillTable = seating =>
    [...new Set(Object.values(seating))].find(id => id !== seating.f1);

  it("prefers a measurable table even when the unmeasurable one is listed first", () => {
    // Same half-drawn sketch as above, but with the placed table earlier in the
    // list. Order must not decide it — the placed table wins from either side.
    const tables = [t("anchor", 10), t("near", 8), t("far", 10)];
    const seating = autoAssign(family, tables, bound, {}, {
      anchor: { x: 0.10, y: 0.10 },
      near:   { x: 0.15, y: 0.12 },
    });
    expect(seating.f1).toBe("anchor");
    expect(spillTable(seating)).toBe("near");
  });

  it("treats a table with a junk y as unplaced, not as distance NaN", () => {
    // `near` is nominally adjacent but its y is unusable. It must drop out of
    // the distance comparison entirely and lose to the table we can measure.
    // Both list orders, because a NaN distance loses every comparison it is on
    // the right of and wins every one it is on the left of — so a fixture that
    // only tests one order proves nothing.
    const positions = {
      anchor: { x: 0.10, y: 0.10 },
      near:   { x: 0.15, y: undefined },
      far:    { x: 0.90, y: 0.90 },
    };
    for (const tables of [[t("anchor", 10), t("far", 10), t("near", 8)],
                          [t("anchor", 10), t("near", 8), t("far", 10)]]) {
      const seating = autoAssign(family, tables, bound, {}, positions);
      expect(spillTable(seating)).toBe("far");
    }
  });

  it("proximity never costs a seat — the reduced case from the fuzz run", () => {
    // Reduced from a random event the fuzz caught (5,000 events, 67 of which
    // seated fewer people once the sketch was read). Three tables in a column,
    // so t1 is between t0 and t2 and "nearest" and "emptiest" disagree.
    //
    // The 17-seat family {g0,g1,g2,g5,g9} fits nowhere: t0 is down to 15 free
    // because g11 is locked there. It spills, and where the last member lands
    // decides the rest of the evening — with the sketch g9 went to t1 (nearest)
    // instead of t2 (emptiest), which later left g4 with no table that g10 was
    // not already sitting at. Three seats, lost to an `apart` constraint three
    // clusters downstream of the decision that caused it.
    const guests = [
      g("g0", { count: 4 }), g("g1", { count: 6 }), g("g2", { count: 2 }),
      g("g4", { count: 3 }), g("g5", { count: 2 }), g("g7", { count: 5 }),
      g("g9", { count: 3 }), g("g10", { count: 4 }), g("g11", { count: 2 }),
    ];
    const tables = [t("t0", 17), t("t1", 10), t("t2", 15)];
    const cons = [
      together("g1", "g2"), together("g9", "g0"), together("g0", "g1"),
      together("g5", "g1"), apart("g10", "g4"),
    ];
    const locks = { g11: "t0" };
    const positions = {
      t0: { x: 0.3, y: 0.1 },
      t1: { x: 0.3, y: 0.5 },
      t2: { x: 0.3, y: 0.9 },
    };
    const placed = seating =>
      guests.reduce((s, x) => s + (seating[x.id] ? x.count : 0), 0);

    const plain  = autoAssign(guests, tables, cons, { ...locks }, null);
    const sketch = autoAssign(guests, tables, cons, { ...locks }, positions);

    expect(placed(plain)).toBe(31);              // everyone, without the sketch
    expect(placed(sketch)).toBeGreaterThanOrEqual(placed(plain));
    for (const guest of guests) expect(sketch[guest.id]).toBeTruthy();
  });

  it("measures distance in both axes", () => {
    // `col` shares the anchor's x exactly and sits across the hall; `next` is a
    // step away in both. Comparing x alone would pick the wrong one.
    const tables = [t("anchor", 10), t("col", 10), t("next", 8)];
    const seating = autoAssign(family, tables, bound, {}, {
      anchor: { x: 0.50, y: 0.10 },
      col:    { x: 0.50, y: 0.90 },
      next:   { x: 0.55, y: 0.12 },
    });
    expect(spillTable(seating)).toBe("next");
  });
});

// ── The invariant, not one example of it ─────────────────────────────────────
// Every fixture above is a case somebody thought of. This one is the rule
// itself, over events nobody designed: reading the venue sketch must never
// leave more people standing than ignoring it would have.
//
// It is worth pinning here rather than only in a qa script because the failure
// is silent — the plan still looks fine, it just has a cousin left over — and
// because the losses came from a cascade (a different-but-equally-valid spill
// changing what every later cluster had to fit into), which no single example
// fixture generalises. Before the fix this run reported 67 losing events in
// 5,000; the numbers here are the same generator at a size the suite can carry.
describe("autoAssign — the sketch never costs a seat (fuzz)", () => {
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Deliberately tight: capacity from 85% to 130% of demand, so who gets a
  // chair actually depends on how well the engine packs.
  function buildEvent(seed) {
    const rnd = mulberry32(seed);
    const ri  = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const guests = Array.from({ length: ri(5, 30) }, (_, i) =>
      g("g" + i, { side: ["bride", "groom"][ri(0, 1)], group: "grp" + ri(0, 3), count: ri(1, 6) }));
    const n = guests.length;
    const totalSeats = guests.reduce((s, x) => s + x.count, 0);

    const nTables = ri(3, 10);
    const target  = Math.round(totalSeats * (0.85 + rnd() * 0.45));
    const caps    = Array.from({ length: nTables }, () => 1);
    for (let left = target - nTables; left > 0; left--) caps[ri(0, nTables - 1)]++;
    const tables = caps.map((c, i) => t("t" + i, Math.max(2, c)));

    const constraints = [];
    for (let i = 0, m = ri(0, Math.max(1, Math.round(n * 0.6))); i < m; i++) {
      const a = "g" + ri(0, n - 1), b = "g" + ri(0, n - 1);
      if (a !== b) constraints.push(rnd() < 0.65 ? together(a, b) : apart(a, b));
    }

    const locks = {};
    for (let i = 0, m = ri(0, 3); i < m; i++) locks["g" + ri(0, n - 1)] = "t" + ri(0, nTables - 1);

    // Sometimes half-drawn — the case the engine has to ignore, not reorder on.
    const positions = {};
    for (const tb of tables) if (rnd() < 0.9) positions[tb.id] = { x: rnd(), y: rnd() };

    return { guests, tables, constraints, locks, positions };
  }

  it("never seats fewer people with the sketch than without, over 2,000 events", () => {
    const placed = (seating, guests) =>
      guests.reduce((s, x) => s + (seating[x.id] ? x.count : 0), 0);

    const losses = [];
    for (let seed = 1; seed <= 2000; seed++) {
      const e = buildEvent(seed);
      const plain  = autoAssign(e.guests, e.tables, e.constraints, { ...e.locks }, null);
      const sketch = autoAssign(e.guests, e.tables, e.constraints, { ...e.locks }, e.positions);
      const delta  = placed(sketch, e.guests) - placed(plain, e.guests);
      if (delta < 0) losses.push({ seed, delta });
    }
    // Report the seeds, not just the count — a failure here has to be
    // reproducible without re-deriving the generator.
    expect(losses).toEqual([]);
  });
});

// ── Holes found by the 12.8 mutation run ─────────────────────────────────────
// Both of these mutants survived the whole 751-test suite. They are not new
// bugs — they are the two rules the room-aware rewrite was built around, with
// no test standing behind either of them.

describe("the room-aware pass — the rules that had no test", () => {
  const at = (x, y) => ({ x, y });

  it("a tie goes to the room-aware pass, because there proximity is free", () => {
    // The documented tie-break. Mutating `>=` to `>` — handing ties to the
    // plain pass — changed the output of 28 of 40,000 fuzzed events and no
    // test noticed. The whole value of asking for a venue sketch is that when
    // two arrangements seat the SAME number of people, the one that puts
    // relatives near each other wins.
    //
    // This exact fixture was found by running the mutant against the real
    // engine and keeping the first case where they disagree ON A TIE. My first
    // attempt at this test was a hand-built "obvious" tie that both versions
    // resolved identically — it passed against the mutant and proved nothing.
    const guests = [g("g0", { count: 4 }), g("g1", { count: 3 }), g("g2", { count: 1 }),
                    g("g3", { count: 3 }), g("g4", { count: 4 })];
    const tables = [t("t0", 3), t("t1", 4), t("t2", 3)];
    const constraints = [together("g0", "g3")];
    const positions = { t0: at(420, 261), t1: at(325, 70), t2: at(208, 72) };

    const withRoom = autoAssign(guests, tables, constraints, {}, positions);
    const plain    = autoAssign(guests, tables, constraints, {}, null);
    const seats = s => guests.reduce((n, x) => n + (s[x.id] ? (x.count || 1) : 0), 0);

    expect(seats(withRoom)).toBe(10);
    expect(seats(plain)).toBe(10);                    // a genuine tie, both ways

    // g0 sits at t1 either way. Its "together" partner g3 does not fit beside
    // it, so it overflows — and t2 is 117px from t1 while t0 is 213px away.
    const d = (a, b) => Math.hypot(positions[a].x - positions[b].x, positions[a].y - positions[b].y);
    expect(d("t1", "t2")).toBeLessThan(d("t1", "t0"));
    expect(withRoom.g0).toBe("t1");
    expect(withRoom.g3).toBe("t2");                   // the NEAR table
    expect(plain.g3).toBe("t0");                      // the emptiest one
  });

  it("never seats fewer people because a sketch exists", () => {
    // The guarantee the wrapper exists to provide, pinned directly.
    for (let seed = 0; seed < 200; seed++) {
      const n = 2 + (seed % 6);
      const guests = Array.from({ length: n }, (_, i) => g("g" + i, { count: 1 + ((seed + i) % 4) }));
      const tables = Array.from({ length: 2 + (seed % 3) }, (_, i) => t("t" + i, 3 + ((seed * (i + 1)) % 8)));
      const positions = Object.fromEntries(
        tables.map((tb, i) => [tb.id, at((i * 37 + seed) % 500, (i * 91 + seed) % 500)])
      );
      const seats = s => guests.reduce((acc, x) => acc + (s[x.id] ? (x.count || 1) : 0), 0);
      expect(seats(autoAssign(guests, tables, [], {}, positions)))
        .toBeGreaterThanOrEqual(seats(autoAssign(guests, tables, [], {}, null)));
    }
  });

  it("a cluster pinned across TWO tables by locks follows both, not just the first", () => {
    // Mutant: `pinnedTables = [seating[pinned[0]]]` — follow only the first
    // pinned member's table. It survived the whole 751-test suite, and it is
    // NOT equivalent: with the host having locked two relatives to different
    // tables and the rest of the family chained between them, the real engine
    // sends the middle of the chain to join the second locked relative, while
    // the mutant parks them at a table with nobody from the family at all.
    //
    // Found by targeted search — the random generator never built a cluster
    // pinned to two tables and reported "no discriminating case", which would
    // have been a false all-clear.
    const guests = [
      g("p1", { count: 2 }), g("p2", { count: 1 }),
      g("c0", { count: 2 }), g("c1", { count: 2 }), g("c2", { count: 2 }), g("c3", { count: 1 }),
      g("x0", { count: 2 }),
    ];
    const tables = [t("t0", 7), t("t1", 5), t("t2", 7), t("t3", 4)];
    const constraints = [
      together("p1", "c0"), together("c0", "c1"), together("c1", "c2"),
      together("c2", "c3"), together("c3", "p2"),
    ];
    const s = autoAssign(guests, tables, constraints, { p1: "t0", p2: "t2" });

    expect(s.p1).toBe("t0");                  // locks are never moved
    expect(s.p2).toBe("t2");
    // The chain's middle joins the SECOND pinned table rather than scattering
    // to a table holding none of them. The mutant puts c1 and c2 at t1.
    expect(s.c1).toBe("t2");
    expect(s.c2).toBe("t2");
  });

  it("does not hand back the caller's own lockedSeating object", () => {
    // `assignOnce` returned the argument itself on the empty-input path, so
    // SeatingScreen's `patchEvent({ seating: newSeating })` could be storing
    // the very object it read.
    const locked = { a: "t1" };
    const out = autoAssign([], [], [], locked);
    expect(out).toEqual(locked);
    expect(out).not.toBe(locked);
  });
});

// The guards in computeViolations exist because the data reaching it is not
// always clean — and a mutation run showed both could be removed with the suite
// still green. Executed against the code with the guard removed, each of these
// throws and takes the Seating screen down with it.
describe("computeViolations survives the dirty data it is guarded against", () => {
  const gs = [g("g1", { name: "אבי" }), g("g2", { name: "בני" })];
  const ts = [t("t1", 10)];

  it("ignores a null or malformed entry in the constraints array", () => {
    const dirty = [null, undefined, "לא אובייקט", 7,
                   { id: "c1", type: "apart", guestA: "g1", guestB: "g2" }];
    const seating = { g1: "t1", g2: "t1" };
    expect(() => computeViolations(gs, ts, dirty, seating)).not.toThrow();
    expect(computeViolations(gs, ts, dirty, seating)).toHaveLength(1);
  });

  // The sharper one: a guest is deleted but their id is STILL in `seating`.
  // That is an ordinary stale entry, not a corrupt file, and the existing test
  // only covered the case where the ghost is absent from seating — which
  // short-circuits before ever reaching the crash.
  it("ignores a constraint naming a deleted guest whose seat entry remains", () => {
    // Both halves matter. The ghost's id must still be IN `seating`, or the
    // "is either unseated" check short-circuits before the guard is reached —
    // and the two must sit at DIFFERENT tables, or a `together` constraint is
    // satisfied and returns before it ever reads the missing guest's name.
    // Getting either wrong makes this test pass against the unguarded code,
    // which is exactly what happened on the first attempt.
    const two  = [t("t1", 10), t("t2", 10)];
    const cons = [{ id: "c1", type: "together", guestA: "g1", guestB: "ghost" }];
    const seating = { g1: "t1", ghost: "t2" };
    expect(() => computeViolations([gs[0]], two, cons, seating)).not.toThrow();
    expect(computeViolations([gs[0]], two, cons, seating)).toEqual([]);
  });
});

// The `together` branch has this test twice. Its `apart` twin had nothing, and
// removing the guard produced 495 differing events out of 4000 — including the
// sentence "שניהם שובצו לאותו שולחן" for a pair where NEITHER guest is seated.
describe("an apart constraint only fires when both guests are actually seated", () => {
  const gs = [g("g1", { name: "אבי" }), g("g2", { name: "בני" })];
  const ts = [t("t1", 10)];
  const apart = [{ id: "c1", type: "apart", guestA: "g1", guestB: "g2" }];

  it("reports nothing when neither is seated", () => {
    expect(computeViolations(gs, ts, apart, {})).toEqual([]);
  });

  it("reports nothing when only one is seated", () => {
    expect(computeViolations(gs, ts, apart, { g1: "t1" })).toEqual([]);
    expect(computeViolations(gs, ts, apart, { g2: "t1" })).toEqual([]);
  });

  it("still reports the real violation when both share a table", () => {
    expect(computeViolations(gs, ts, apart, { g1: "t1", g2: "t1" })).toHaveLength(1);
  });
});
