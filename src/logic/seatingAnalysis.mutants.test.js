import { describe, it, expect } from "vitest";
import { computeQualityScore, generateSuggestions } from "./seatingAnalysis.js";

// Nine edits to seatingAnalysis.js passed the whole suite in the third-review
// mutation run (29.9). This is the panel that tells the host what to fix, and
// three of the nine make it suggest something wrong rather than merely
// something different: evicting a bigger family than the overflow needs,
// moving someone off a table the host LOCKED, and merging two tables whose
// guests must not sit together. The rest are thresholds whose documented
// value no test pinned. Each scenario is the smallest that reaches the line.

const G = (id, over = {}) => ({ id, name: id, side: "bride", group: "", count: 1, rsvp: "confirmed", ...over });
const T = (id, capacity = 10) => ({ id, name: id, capacity });
const suggest = (guests, tables, constraints, seating, opts) =>
  generateSuggestions(guests, tables, constraints, seating, null, opts);

describe("quality score: a table of four counts as underused", () => {
  // The header documents it: "underused tables (<40%, cap ≥ 4): -2". One
  // guest at a four-seat table is 25% — a lonely table, and exactly the case
  // the rule was written for (small tables are where it shows).
  it("1 of 4 → 98", () => {
    expect(computeQualityScore([G("a")], [T("t1", 4)], [], { a: "t1" }, [])).toBe(98);
  });
});

describe("unassigned: more than a fifth is critical", () => {
  // 3 of 10 rows with no table is not a detail to get to later.
  it("3 of 10 → critical", () => {
    const guests = Array.from({ length: 10 }, (_, i) => G("g" + i));
    const seating = Object.fromEntries(guests.slice(0, 7).map(g => [g.id, "t1"]));
    const s = suggest(guests, [T("t1", 20)], [], seating).find(x => x.type === "unassigned");
    expect(s.severity).toBe("critical");
  });
});

describe("an overloaded table evicts the SMALLEST row that clears the excess", () => {
  // Capacity 4, rows of 1, 2 and 3 → over by 2. The 2 clears it exactly; the 3
  // clears it too but sends a family of three back to the waiting list to fix
  // a problem two chairs wide.
  it("evicts the 2, not the 3", () => {
    const guests = [G("one", { count: 1 }), G("two", { count: 2 }), G("three", { count: 3 })];
    const seating = { one: "t1", two: "t1", three: "t1" };
    const s = suggest(guests, [T("t1", 4), T("t2", 10)], [], seating).find(x => x.type === "overloaded");
    expect(s.applyAction.guestId).toBe("two");
  });
});

describe("together_pending: 'seat them with their partner' only when there is room", () => {
  // The seated partner's table has one free chair; the waiting row is a family
  // of three. Offering the one-click move puts three people on one chair — the
  // panel creating an overbooking with the host's own click.
  it("no room → canApply false", () => {
    const guests = [G("p1"), G("fill", { count: 3 }), G("wait", { count: 3 })];
    const constraints = [{ id: "c", type: "together", guestA: "p1", guestB: "wait" }];
    const s = suggest(guests, [T("t1", 5)], constraints, { p1: "t1", fill: "t1" })
      .find(x => x.type === "together_pending");
    expect(s.canApply).toBe(false);
    expect(s.applyAction).toBeNull();
  });
});

// Two groups each stranded one member at the other's table — the textbook
// cohesion swap. Shared by the lock test and the ordering test.
const swapWorld = () => ({
  guests: [
    G("armyAtT1", { group: "army" }), G("fam1", { group: "family" }), G("fam2", { group: "family" }),
    G("famAtT2", { group: "family" }), G("army1", { group: "army" }), G("army2", { group: "army" }),
  ],
  seating: { armyAtT1: "T1", fam1: "T1", fam2: "T1", famAtT2: "T2", army1: "T2", army2: "T2" },
  tables: [T("T1"), T("T2")],
});

describe("the cohesion swap respects a lock on EITHER table", () => {
  // The lock's tooltip promises no suggested changes to that table. A swap
  // changes both: T1 loses armyAtT1 and gains famAtT2. With T1 locked, it
  // must not be offered from either end.
  it("T1 locked → no swap touching T1", () => {
    const { guests, seating, tables } = swapWorld();
    const all = suggest(guests, tables, [], seating, { lockedTableIds: ["T1"] });
    const touching = all.filter(x => x.type === "swap_guests"
      && (x.applyAction.tableAId === "T1" || x.applyAction.tableBId === "T1"));
    expect(touching).toEqual([]);
  });
  it("(and unlocked, the swap IS offered — the scenario reaches the line)", () => {
    const { guests, seating, tables } = swapWorld();
    expect(suggest(guests, tables, [], seating).some(x => x.type === "swap_guests")).toBe(true);
  });
});

describe("side balance: three of four is 'heavy'", () => {
  // ratio ≥ 0.75 is the documented bride-heavy line. A 3:1 table beside a 1:3
  // table is the plainest imbalance there is, and it produced no suggestion.
  it("3 bride + 1 groom beside 1 bride + 3 groom → a side swap is offered", () => {
    const b = id => G(id, { side: "bride" }), g = id => G(id, { side: "groom" });
    const guests = [b("b1"), b("b2"), b("b3"), g("g1"), g("g2"), g("g3"), g("g4"), b("b4")];
    const seating = { b1: "T1", b2: "T1", b3: "T1", g1: "T1", g2: "T2", g3: "T2", g4: "T2", b4: "T2" };
    const all = suggest(guests, [T("T1"), T("T2")], [], seating);
    expect(all.some(x => x.id.startsWith("side_swap_"))).toBe(true);
  });
});

describe("merging two half-empty tables is never offered across an 'apart' pair", () => {
  // The two people the host said must NOT sit together are each alone at a
  // half-empty table. "Merge them" is the one suggestion that recreates the
  // exact conflict the host set up the rule to prevent.
  it("a apart from b, each alone → no merge_tables", () => {
    const guests = [G("a"), G("b")];
    const constraints = [{ id: "c", type: "apart", guestA: "a", guestB: "b" }];
    const all = suggest(guests, [T("T1"), T("T2")], constraints, { a: "T1", b: "T2" });
    expect(all.filter(x => x.type === "merge_tables")).toEqual([]);
  });
  it("(without the rule, the merge IS offered — the scenario reaches the line)", () => {
    const all = suggest([G("a"), G("b")], [T("T1"), T("T2")], [], { a: "T1", b: "T2" });
    expect(all.some(x => x.type === "merge_tables")).toBe(true);
  });
});

describe("a group over TWO tables is not 'split'", () => {
  // Twelve army friends cannot sit at one table of ten; two tables is the
  // normal shape of a big group. The suggestion is for three or more, where
  // the group really is scattered.
  it("4 members over 2 tables → no split_group; over 3 → one", () => {
    const two = [G("a1", { group: "army" }), G("a2", { group: "army" }), G("a3", { group: "army" }), G("a4", { group: "army" })];
    const tables = [T("T1"), T("T2"), T("T3")];
    expect(suggest(two, tables, [], { a1: "T1", a2: "T1", a3: "T2", a4: "T2" })
      .some(x => x.type === "split_group")).toBe(false);
    expect(suggest(two, tables, [], { a1: "T1", a2: "T2", a3: "T3", a4: "T3" })
      .some(x => x.type === "split_group")).toBe(true);
  });
});

describe("within a section, the more severe item comes first", () => {
  // The panel renders in this order. In "fixes", a warning (people with no
  // seat) must come before an info (a nicer arrangement) — reversed, the host
  // reads "swap two guests for cohesion" above "a guest has no table".
  it("unassigned (warning) before swap_guests (info)", () => {
    const { guests, seating, tables } = swapWorld();
    const all = suggest([...guests, ...Array.from({ length: 5 }, (_, i) => G("s" + i)), G("loose")],
      tables, [], { ...seating, s0: "T1", s1: "T1", s2: "T2", s3: "T2", s4: "T2" });
    const fixes = all.filter(x => x.section === "fixes").map(x => x.severity);
    expect(fixes).toContain("warning");
    expect(fixes).toContain("info");
    expect(fixes.indexOf("warning")).toBeLessThan(fixes.indexOf("info"));
  });
});
