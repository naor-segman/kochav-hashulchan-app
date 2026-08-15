import { describe, it, expect } from "vitest";
import { generateSuggestions, computeQualityScore } from "./seatingAnalysis.js";
import { computeViolations } from "./seating.js";

// Concise fixtures.
const g = (id, extra = {}) => ({ id, name: id, side: "bride", group: "משפחה", count: 1, rsvp: "pending", ...extra });
const t = (id, capacity) => ({ id, name: id, capacity });
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

  it("does not penalize declined guests who are left unseated", () => {
    // a,b active + seated; c declined + unseated. Score should be full — c never needs a seat.
    const guests = [g("a"), g("b"), g("c", { rsvp: "declined" })];
    const tables = [t("t1", 10)];
    const seating = { a: "t1", b: "t1" };
    const violations = computeViolations(guests, tables, [], seating);
    const score = computeQualityScore(guests, tables, [], seating, violations);
    expect(score).toBeGreaterThanOrEqual(90);
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

// Ten of the twelve suggestion categories had no direct test. This is the
// module that once offered a fix advertised as violation-free and turned a
// clean plan into a critical violation, so "it renders something" is not the
// bar — each category is pinned to what it claims, and every applicable
// action is replayed against computeViolations.
describe("generateSuggestions — the categories that had no coverage", () => {
  it("offers a concrete move for a single broken 'together' pair", () => {
    const guests = [g("A"), g("B")];
    const tables = [t("t1", 10), t("t2", 10)];
    const cons   = [{ id: "c", type: "together", guestA: "A", guestB: "B" }];
    const s = find(generateSuggestions(guests, tables, cons, { A: "t1", B: "t2" }), "together_violated");
    expect(s.severity).toBe("critical");
    expect(s.canApply).toBe(true);
    expect(s.applyAction).toMatchObject({ type: "moveGuest", guestId: "B", toTableId: "t1" });
    expect(s.violationDelta).toBe(-1);
  });

  it("refuses to move a locked guest, and says so instead of offering a button", () => {
    const guests = [g("A"), g("B")];
    const tables = [t("t1", 10), t("t2", 10)];
    const cons   = [{ id: "c", type: "together", guestA: "A", guestB: "B" }];
    const s = find(generateSuggestions(guests, tables, cons, { A: "t1", B: "t2" }, null,
                                       { lockedGuestIds: ["B"] }), "together_violated");
    expect(s.canApply).toBe(false);
    expect(s.applyAction).toBeNull();
  });

  it("refuses to move when the destination table has no room", () => {
    const guests = [g("A"), g("filler", { count: 9 }), g("B")];
    const tables = [t("t1", 10), t("t2", 10)];
    const cons   = [{ id: "c", type: "together", guestA: "A", guestB: "B" }];
    const s = find(generateSuggestions(guests, tables, cons, { A: "t1", filler: "t1", B: "t2" }), "together_violated");
    expect(s.canApply).toBe(false);
  });

  it("collapses several broken 'together' pairs into one non-applicable summary", () => {
    const guests = [g("A"), g("B"), g("C"), g("D")];
    const tables = [t("t1", 10), t("t2", 10)];
    const cons   = [{ id: "c1", type: "together", guestA: "A", guestB: "B" },
                    { id: "c2", type: "together", guestA: "C", guestB: "D" }];
    const s = find(generateSuggestions(guests, tables, cons, { A: "t1", B: "t2", C: "t1", D: "t2" }),
                   "together_violated");
    expect(s.id).toBe("together_multi");
    expect(s.canApply).toBe(false);
    expect(s.violationDelta).toBe(-2);
  });

  it("collapses several broken 'apart' pairs the same way", () => {
    const guests = [g("A"), g("B"), g("C"), g("D")];
    const tables = [t("t1", 10), t("t2", 10)];
    const cons   = [{ id: "c1", type: "apart", guestA: "A", guestB: "B" },
                    { id: "c2", type: "apart", guestA: "C", guestB: "D" }];
    const s = find(generateSuggestions(guests, tables, cons, { A: "t1", B: "t1", C: "t2", D: "t2" }),
                   "apart_violated");
    expect(s.id).toBe("apart_multi");
    expect(s.canApply).toBe(false);
    expect(s.violationDelta).toBe(-2);
  });

  // Pulling a guest off a table to relieve it must not be the guest who is
  // pinned there by a "together" constraint — that trades a capacity problem
  // for a broken promise.
  it("relieves an overloaded table without evicting a guest anchored by a constraint", () => {
    const guests = [g("anch1"), g("anch2"), g("free")];
    const tables = [t("t1", 2)];
    const cons   = [{ id: "c", type: "together", guestA: "anch1", guestB: "anch2" }];
    const s = find(generateSuggestions(guests, tables, cons, { anch1: "t1", anch2: "t1", free: "t1" }), "overloaded");
    expect(s.canApply).toBe(true);
    expect(s.applyAction.guestId).toBe("free");
  });

  it("offers no eviction at all when every guest on the overloaded table is anchored or locked", () => {
    const guests = [g("anch1"), g("anch2")];
    const tables = [t("t1", 1)];
    const cons   = [{ id: "c", type: "together", guestA: "anch1", guestB: "anch2" }];
    const s = find(generateSuggestions(guests, tables, cons, { anch1: "t1", anch2: "t1" }), "overloaded");
    expect(s.canApply).toBe(false);
    expect(s.applyAction).toBeNull();
  });

  it("spots a guest sitting alone while their group sits together elsewhere", () => {
    const guests = [g("lonely", { group: "משפחה" }), g("m1", { group: "משפחה" }),
                    g("m2", { group: "משפחה" }), g("x", { group: "עבודה" })];
    const tables = [t("t1", 10), t("t2", 10)];
    const s = find(generateSuggestions(guests, tables, [], { lonely: "t1", x: "t1", m1: "t2", m2: "t2" }),
                   "isolated_guest");
    expect(s.applyAction).toMatchObject({ type: "moveGuest", guestId: "lonely", toTableId: "t2" });
    expect(s.severity).toBe("warning");
  });

  it("does not call a guest isolated when nobody else shares their group", () => {
    const guests = [g("solo", { group: "יחיד" }), g("a"), g("b")];
    const tables = [t("t1", 10), t("t2", 10)];
    const s = generateSuggestions(guests, tables, [], { solo: "t1", a: "t2", b: "t2" });
    expect(s.find(x => x.id === "isolated_solo")).toBeUndefined();
  });

  it("flags a barely-filled table once most guests are seated", () => {
    const guests  = Array.from({ length: 10 }, (_, i) => g("g" + i));
    const seating = Object.fromEntries(guests.map((x, i) => [x.id, i === 0 ? "t1" : "t2"]));
    const s = generateSuggestions(guests, [t("t1", 10), t("t2", 10)], [], seating)
      .filter(x => x.type === "underused");
    expect(s).toHaveLength(1);
    expect(s[0].explanation).toContain("10%");
  });

  it("stays quiet about empty tables early on, when most guests are still unseated", () => {
    const guests = Array.from({ length: 10 }, (_, i) => g("g" + i));
    const s = generateSuggestions(guests, [t("t1", 10), t("t2", 10)], [], { g0: "t1" });
    expect(s.filter(x => x.type === "underused")).toHaveLength(0);
  });

  it("proposes merging two half-empty tables that would actually fit together", () => {
    const guests = [g("a"), g("b"), g("c"), g("d")];
    const s = find(generateSuggestions(guests, [t("t1", 10), t("t2", 10)], [],
                                       { a: "t1", b: "t1", c: "t2", d: "t2" }), "merge_tables");
    expect(s.canApply).toBe(false);           // structural change — never one-click
    expect(s.explanation).toContain("לאחד");
  });

  it("does not propose a merge that would overflow the surviving table", () => {
    const guests = [g("a", { count: 4 }), g("b", { count: 4 })];
    const s = generateSuggestions(guests, [t("t1", 6), t("t2", 6)], [], { a: "t1", b: "t2" });
    expect(s.filter(x => x.type === "merge_tables")).toHaveLength(0);
  });

  it("notices a group scattered across three tables", () => {
    const guests = [g("a"), g("b"), g("c"), g("d")];
    const s = find(generateSuggestions(guests, [t("t1", 10), t("t2", 10), t("t3", 10)], [],
                                       { a: "t1", b: "t2", c: "t3", d: "t1" }), "split_group");
    expect(s.explanation).toContain("3 שולחנות");
  });

  it("reports a table that is 80% one side", () => {
    const guests = [g("b1"), g("b2"), g("b3"), g("b4"), g("b5"), g("g1", { side: "groom" })];
    const seating = Object.fromEntries(guests.map(x => [x.id, "t1"]));
    const s = find(generateSuggestions(guests, [t("t1", 10)], [], seating), "side_imbalance");
    expect(s.explanation).toContain("83%");
  });

  it("says nothing about balance on a single-side table — that is not an imbalance", () => {
    const guests  = Array.from({ length: 6 }, (_, i) => g("b" + i));
    const seating = Object.fromEntries(guests.map(x => [x.id, "t1"]));
    expect(generateSuggestions(guests, [t("t1", 10)], [], seating)
      .filter(x => x.type === "side_imbalance")).toHaveLength(0);
  });

  it("proposes a side-balancing swap between a bride-heavy and a groom-heavy table", () => {
    const guests = [g("b1"), g("b2"), g("b3"), g("b4"), g("gg1", { side: "groom" }),
                    g("g1", { side: "groom" }), g("g2", { side: "groom" }), g("g3", { side: "groom" }), g("bb1")];
    const seating = { b1: "t1", b2: "t1", b3: "t1", b4: "t1", gg1: "t1",
                      g1: "t2", g2: "t2", g3: "t2", bb1: "t2" };
    const s = generateSuggestions(guests, [t("t1", 10), t("t2", 10)], [], seating)
      .find(x => x.id.startsWith("side_swap_"));
    expect(s.applyAction.type).toBe("swapGuests");
    expect(s.applyAction.tableAId).toBe("t1");
    expect(s.applyAction.tableBId).toBe("t2");
  });

  it("proposes a cohesion swap that moves both guests toward their own group", () => {
    const guests = [g("a1", { group: "עבודה" }), g("a2", { group: "עבודה" }), g("a3", { group: "עבודה" }),
                    g("b1", { group: "צבא" }),   g("b2", { group: "צבא" }),   g("b3", { group: "צבא" })];
    const seating = { a1: "t1", a2: "t2", a3: "t2", b1: "t2", b2: "t1", b3: "t1" };
    const s = generateSuggestions(guests, [t("t1", 4), t("t2", 4)], [], seating)
      .find(x => x.id.startsWith("swap_group_"));
    expect(s.applyAction).toMatchObject({ type: "swapGuests", guestAId: "a1", guestBId: "b1" });
  });

  // The score is computed by the caller and passed in; the summary only appears
  // below 80, so a decent plan is not nagged about.
  it("summarizes a weak plan with a quality-score note, and stays silent on a good one", () => {
    const guests  = [g("a"), g("b"), g("c"), g("d")];
    const seating = { a: "t1", b: "t1", c: "t1", d: "t1" };
    const weak = find(generateSuggestions(guests, [t("t1", 10)], [], seating, 55), "quality_score");
    expect(weak).toBeDefined();
    expect(weak.severity).toBe("warning");                        // below 60
    expect(weak.explanation).toContain("55");

    expect(find(generateSuggestions(guests, [t("t1", 10)], [], seating, 70), "quality_score").severity)
      .toBe("info");                                              // 60–79
    expect(find(generateSuggestions(guests, [t("t1", 10)], [], seating, 88), "quality_score"))
      .toBeUndefined();                                           // 80+ — nothing to say
  });

  it("orders critical problems before fixes and opportunities", () => {
    const guests = [g("A"), g("B"), g("C"), g("D"), g("E")];
    const tables = [t("t1", 10), t("t2", 10)];
    const cons   = [{ id: "c", type: "together", guestA: "A", guestB: "B" }];
    const s = generateSuggestions(guests, tables, cons, { A: "t1", B: "t2", C: "t2", D: "t2", E: "t2" });
    const sections = s.map(x => x.section);
    const rank = { critical: 0, fixes: 1, opportunities: 2 };
    expect(sections.map(x => rank[x])).toEqual([...sections.map(x => rank[x])].sort((a, b) => a - b));
  });
});

// The engine advertises `canApply` as "this is safe to press". Replay every
// applicable action and check the plan is not worse afterwards.
describe("every applicable suggestion is actually safe to apply", () => {
  const apply = (seating, act) => {
    if (act.type === "moveGuest")     return { ...seating, [act.guestId]: act.toTableId };
    if (act.type === "unassignGuest") { const n = { ...seating }; delete n[act.guestId]; return n; }
    if (act.type === "swapGuests")    return { ...seating, [act.guestAId]: act.tableBId, [act.guestBId]: act.tableAId };
    return seating;
  };

  const scenarios = [
    ["broken together pair", [g("A"), g("B"), g("C")], [t("t1", 10), t("t2", 10)],
     [{ id: "c", type: "together", guestA: "A", guestB: "B" }], { A: "t1", B: "t2", C: "t2" }],
    ["apart pair sharing a table", [g("A"), g("B"), g("C")], [t("t1", 10), t("t2", 10)],
     [{ id: "c", type: "apart", guestA: "A", guestB: "B" }], { A: "t1", B: "t1", C: "t2" }],
    ["overloaded table", [g("a"), g("b"), g("c")], [t("t1", 2), t("t2", 10)], [], { a: "t1", b: "t1", c: "t1" }],
    ["isolated guest", [g("lonely", { group: "משפחה" }), g("m1", { group: "משפחה" }),
                        g("m2", { group: "משפחה" }), g("x")],
     [t("t1", 10), t("t2", 10)], [], { lonely: "t1", x: "t1", m1: "t2", m2: "t2" }],
    ["side-heavy tables", [g("b1"), g("b2"), g("b3"), g("b4"), g("gg1", { side: "groom" }),
                           g("g1", { side: "groom" }), g("g2", { side: "groom" }),
                           g("g3", { side: "groom" }), g("bb1")],
     [t("t1", 10), t("t2", 10)], [],
     { b1: "t1", b2: "t1", b3: "t1", b4: "t1", gg1: "t1", g1: "t2", g2: "t2", g3: "t2", bb1: "t2" }],
    ["cohesion swap", [g("a1", { group: "עבודה" }), g("a2", { group: "עבודה" }), g("a3", { group: "עבודה" }),
                       g("b1", { group: "צבא" }), g("b2", { group: "צבא" }), g("b3", { group: "צבא" })],
     [t("t1", 4), t("t2", 4)], [], { a1: "t1", a2: "t2", a3: "t2", b1: "t2", b2: "t1", b3: "t1" }],
  ];

  let applicableSeen = 0;

  it.each(scenarios)("%s", (_label, guests, tables, cons, seating) => {
    const before = computeViolations(guests, tables, cons, seating);
    for (const s of generateSuggestions(guests, tables, cons, seating, {})) {
      if (!s.canApply || !s.applyAction || s.applyAction.type === "seatUnassigned") continue;
      applicableSeen++;
      const after = computeViolations(guests, tables, cons, apply(seating, s.applyAction));
      expect(after.length, `"${s.explanation}" made things worse`).toBeLessThanOrEqual(before.length);
      // A fix that claims to remove a violation must actually remove one.
      if (s.violationDelta < 0) expect(after.length).toBeLessThan(before.length);
    }
  });

  it("actually exercised some applicable suggestions (guards against a vacuous pass)", () => {
    expect(applicableSeen).toBeGreaterThan(3);
  });
});

describe("suggestions never trade one violation for another", () => {
  const G = (id, count = 1, group = "חברים", side = "bride") =>
    ({ id, name: id, count, group, side, rsvp: "confirmed" });

  it("does not separate a together pair to fix an isolated guest", () => {
    // dad is bound to mom at t1 but his own group sits at t2, so the panel
    // offered "move dad to t2" — advertised as violation-free.
    const guests  = [G("dad", 1, "חברים"), G("mom", 1, "משפחה"),
                     G("f1"), G("f2"), G("f3")];
    const tables  = [{ id: "t1", name: "שולחן 1", capacity: 10 },
                     { id: "t2", name: "שולחן 2", capacity: 10 }];
    const cons    = [{ id: "c1", type: "together", guestA: "dad", guestB: "mom" }];
    const seating = { dad: "t1", mom: "t1", f1: "t2", f2: "t2", f3: "t2" };

    expect(computeViolations(guests, tables, cons, seating)).toHaveLength(0);

    // NOTE: this loop read `s.action`, which is not a field the engine emits —
    // the real one is `applyAction`. Every iteration hit the guard and skipped,
    // so the regression test for the bug it was written for asserted nothing.
    const moves = generateSuggestions(guests, tables, cons, seating, {})
      .filter(s => s.canApply && s.applyAction?.type === "moveGuest");
    for (const s of moves) {
      const after = { ...seating, [s.applyAction.guestId]: s.applyAction.toTableId };
      expect(computeViolations(guests, tables, cons, after)).toHaveLength(0);
    }
    // dad is pinned to mom, so the only safe answer is to offer no move at all.
    expect(moves.map(s => s.applyAction.guestId)).not.toContain("dad");
  });

  it("does not seat an apart pair together while fixing a together pair", () => {
    const guests  = [G("A"), G("B"), G("C")];
    const tables  = [{ id: "t1", name: "שולחן 1", capacity: 10 },
                     { id: "t2", name: "שולחן 2", capacity: 10 }];
    const cons    = [{ id: "c1", type: "together", guestA: "A", guestB: "B" },
                     { id: "c2", type: "apart",    guestA: "B", guestB: "C" }];
    const seating = { A: "t1", C: "t1", B: "t2" };

    const suggestions = generateSuggestions(guests, tables, cons, seating, {});
    for (const s of suggestions) {
      if (!s.canApply || s.applyAction?.type !== "moveGuest") continue;
      const after = { ...seating, [s.applyAction.guestId]: s.applyAction.toTableId };
      const apart = computeViolations(guests, tables, cons, after)
        .filter(v => v.type === "apart");
      expect(apart).toHaveLength(0);
    }
    // Moving B onto t1 would reunite the together pair and seat the apart pair
    // together in the same stroke, so the only correct answer is to refuse.
    const together = suggestions.find(s => s.type === "together_violated");
    expect(together.canApply).toBe(false);
  });
});

// ── The one-click fixes must not trade one violation for two ────────────────
//
// Every suggestion with `canApply: true` promises a `violationDelta`. Three of
// them lied, and an audit reproduced each: applying the "safe" fix took the
// plan from 1 violation to 2 while the panel printed "הפרה אחת פחות" beside the
// button. The rule these pin: applying a suggestion may never increase the
// number of violations.
describe("applying a suggestion never makes the plan worse", () => {
  const together = (a, b) => ({ id: `tog-${a}-${b}`, type: "together", guestA: a, guestB: b });

  // Apply an action the way SeatingScreen does, and re-count.
  const applied = (seating, action) => {
    const next = { ...seating };
    if (action.type === "moveGuest")     next[action.guestId] = action.toTableId;
    if (action.type === "unassignGuest") delete next[action.guestId];
    return next;
  };
  // Total unmet-ness, not just `computeViolations.length`.
  //
  // computeViolations deliberately counts only CONFLICTS, so a together pair
  // whose partner has been thrown back into the waiting list no longer scores
  // as a violation — which would let "unassign B" look like an improvement
  // while it actually separated B from two people. The measure that matters to
  // the host is: how many together constraints are still unmet, plus every
  // other violation.
  const count = (guests, tables, constraints, seating) => {
    const unmetTogether = constraints.filter(c =>
      c.type === "together" &&
      !(seating[c.guestA] && seating[c.guestA] === seating[c.guestB])).length;
    const others = computeViolations(guests, tables, constraints, seating)
      .filter(v => v.type !== "together").length;
    return unmetTogether + others;
  };

  it("the together fix does not separate the guest from their OTHER partners", () => {
    // A@t1, B+C+D@t2 with together(A,B), together(B,C), together(B,D).
    // Moving B to t1 fixes A-B and breaks B-C and B-D.
    const guests = [g("A"), g("B"), g("C"), g("D")];
    const tables = [t("t1", 10), t("t2", 10)];
    const constraints = [together("A", "B"), together("B", "C"), together("B", "D")];
    const seating = { A: "t1", B: "t2", C: "t2", D: "t2" };

    const before = count(guests, tables, constraints, seating);
    const s = find(generateSuggestions(guests, tables, constraints, seating), "together_violated");
    expect(s).toBeDefined();
    if (s.canApply) {
      const after = count(guests, tables, constraints, applied(seating, s.applyAction));
      expect(after).toBeLessThanOrEqual(before);
    } else {
      expect(s.applyAction).toBeNull();
    }
  });

  it("the apart fix does not orphan the guest's together partners", () => {
    // A+B+C+D@t1 with apart(A,B), together(B,C), together(B,D).
    // Unassigning B fixes A/B and orphans C and D.
    const guests = [g("A"), g("B"), g("C"), g("D")];
    const tables = [t("t1", 10)];
    const constraints = [apart("A", "B"), together("B", "C"), together("B", "D")];
    const seating = { A: "t1", B: "t1", C: "t1", D: "t1" };

    const before = count(guests, tables, constraints, seating);
    const s = find(generateSuggestions(guests, tables, constraints, seating), "apart_violated");
    expect(s).toBeDefined();
    if (s.canApply) {
      const after = count(guests, tables, constraints, applied(seating, s.applyAction));
      expect(after).toBeLessThanOrEqual(before);
    } else {
      expect(s.applyAction).toBeNull();
    }
  });

  it("the overloaded fix evicts someone whose seats actually clear the excess", () => {
    // A 2-seat table holding a 1-seat guest and a 5-seat group: evicting the
    // 1-seat guest leaves the table over by three, while still claiming -1.
    const guests = [g("small", { count: 1 }), g("big", { count: 5 })];
    const tables = [t("t1", 2)];
    const seating = { small: "t1", big: "t1" };

    const before = count(guests, tables, [], seating);
    const s = find(generateSuggestions(guests, tables, [], seating), "overloaded");
    expect(s).toBeDefined();
    if (s.canApply) {
      const after = count(guests, tables, [], applied(seating, s.applyAction));
      expect(after).toBeLessThan(before);   // a claimed -1 must actually be -1
    } else {
      expect(s.applyAction).toBeNull();
    }
  });

  it("names the pair when a together constraint is only waiting on a seat", () => {
    // One member seated, the other not. This used to dock 15 points off the
    // quality score and produce no suggestion at all, so the host saw a low
    // number with nothing to act on.
    const guests = [g("A"), g("B")];
    const tables = [t("t1", 10)];
    const constraints = [together("A", "B")];
    const s = generateSuggestions(guests, tables, constraints, { A: "t1" });
    const pending = find(s, "together_pending");
    expect(pending).toBeDefined();
    expect(pending.canApply).toBe(true);
    expect(pending.applyAction).toMatchObject({ type: "moveGuest", guestId: "B", toTableId: "t1" });
  });
});

// ── From the logic review (12.8) ──────────────────────────────────────────────
// Everything below fails on the pre-fix code. Each one is a bug the 751-test
// suite was green through.

const together = (a, b) => ({ id: `tog-${a}-${b}`, type: "together", guestA: a, guestB: b });

describe("a suggestion the panel cannot render is a suggestion that does not exist", () => {
  // SuggestionsPanel builds its groups from exactly these three strings
  // (SuggestionsPanel.jsx: `["critical", "fixes", "opportunities"]`). Any other
  // value produces an item that is generated, COUNTED IN THE HEADER BADGE, and
  // never displayed — the badge said "2 המלצות" and the panel listed one.
  //
  // The sort hid it: `sectionOrder[a.section] ?? 1` maps an unknown string onto
  // the "fixes" rank, so the ORDER of the list stayed correct while one of its
  // items was invisible. `together_pending` shipped as section "warnings" and
  // ~20% of events emitted it.
  const RENDERED = ["critical", "fixes", "opportunities"];

  // A battery wide enough to reach every branch that pushes a suggestion.
  const scenarios = [
    ["unassigned",        [g("a"), g("b")], [t("t1", 10)], [], { a: "t1" }],
    ["together pending",  [g("A"), g("B")], [t("t1", 10)], [together("A", "B")], { A: "t1" }],
    ["together violated", [g("A"), g("B")], [t("t1", 10), t("t2", 10)], [together("A", "B")], { A: "t1", B: "t2" }],
    ["apart violated",    [g("A"), g("B")], [t("t1", 10)], [apart("A", "B")], { A: "t1", B: "t1" }],
    ["overloaded",        [g("A", { count: 8 }), g("B", { count: 8 })], [t("t1", 10)], [], { A: "t1", B: "t1" }],
    ["isolated",          [g("A"), g("B"), g("C", { group: "חברים" })],
                          [t("t1", 10), t("t2", 10)], [], { A: "t1", B: "t1", C: "t1" }],
    ["underfilled",       [g("A")], [t("t1", 12), t("t2", 12)], [], { A: "t1" }],
  ];

  for (const [label, guests, tables, constraints, seating] of scenarios) {
    it(`every section is one the panel renders — ${label}`, () => {
      const s = generateSuggestions(guests, tables, constraints, seating);
      const bad = s.filter(x => x.section && !RENDERED.includes(x.section));
      expect(bad.map(x => `${x.type}:${x.section}`)).toEqual([]);
    });
  }
});

describe("together_pending — the one-click fix must not create the violation it is fixing", () => {
  // Measured before the fix: 0 violations and quality 93 before applying,
  // 1 critical violation and quality 81 after, with violationDelta advertised
  // as 0. `moveBreaksTogether` cannot catch this — it returns false on its
  // first line for a guest who has no current table, which is every guest this
  // suggestion is about.
  const scene = () => ({
    guests: [g("סבתא"), g("אמא"), g("אבא")],
    tables: [t("t1", 6), t("t2", 6)],
    constraints: [together("אמא", "סבתא"), together("אמא", "אבא")],
    seating: { "סבתא": "t1", "אבא": "t2" },   // אמא waiting
  });

  it("refuses to seat the waiting guest when another partner sits elsewhere", () => {
    const { guests, tables, constraints, seating } = scene();
    const pending = find(generateSuggestions(guests, tables, constraints, seating), "together_pending");
    expect(pending).toBeDefined();
    expect(pending.canApply).toBe(false);
    expect(pending.applyAction).toBeNull();
  });

  it("and the arrangement it refused to create really is worse", () => {
    // The proof that the refusal is right, not merely cautious.
    const { guests, tables, constraints, seating } = scene();
    const before = computeViolations(guests, tables, constraints, seating).length;
    const after  = computeViolations(guests, tables, constraints, { ...seating, "אמא": "t1" }).length;
    expect(before).toBe(0);
    expect(after).toBe(1);
  });

  it("still offers the fix when the waiting guest has no OTHER seated partner", () => {
    // The guard must not make the whole feature useless.
    const guests = [g("סבתא"), g("אמא")];
    const s = generateSuggestions(guests, [t("t1", 6)], [together("אמא", "סבתא")], { "סבתא": "t1" });
    expect(find(s, "together_pending").canApply).toBe(true);
  });

  it("detects the pair in BOTH directions", () => {
    // The branch `!ta && tb` had no coverage at all: half the feature could be
    // deleted and the suite stayed green.
    const guests = [g("A"), g("B")];
    const tables = [t("t1", 6)];
    const cons   = [together("A", "B")];
    // seated is guestB
    expect(find(generateSuggestions(guests, tables, cons, { B: "t1" }), "together_pending"))
      .toBeDefined();
    // seated is guestA
    expect(find(generateSuggestions(guests, tables, cons, { A: "t1" }), "together_pending"))
      .toBeDefined();
  });
});

describe("a locked table is locked as a SOURCE too", () => {
  // TableCard's own tooltip: "נעלו שולחן — לא יוצעו שינויים לשולחן זה", with no
  // qualification. Five suggestion types checked the lock on the DESTINATION
  // only, so the one-click button happily pulled a guest OUT of a table the
  // host had declared settled. Section 10 (side_swap) already checked both —
  // that was the intent the other five missed.
  const locked = ids => ({ lockedTableIds: ids });

  it("together_violated will not move a guest out of a locked table", () => {
    const guests = [g("A"), g("B")];
    const tables = [t("t1", 10), t("t2", 10)];
    const cons   = [together("A", "B")];
    const seat   = { A: "t1", B: "t2" };
    expect(find(generateSuggestions(guests, tables, cons, seat, null, {}), "together_violated").canApply).toBe(true);
    // B sits at t2 and would be moved to t1. Locking t2 must stop it.
    expect(find(generateSuggestions(guests, tables, cons, seat, null, locked(["t2"])), "together_violated").canApply).toBe(false);
  });

  it("apart_violated will not unassign out of a locked table", () => {
    const guests = [g("A"), g("B")];
    const tables = [t("t1", 10)];
    const cons   = [apart("A", "B")];
    const seat   = { A: "t1", B: "t1" };
    expect(find(generateSuggestions(guests, tables, cons, seat, null, {}), "apart_violated").canApply).toBe(true);
    expect(find(generateSuggestions(guests, tables, cons, seat, null, locked(["t1"])), "apart_violated").canApply).toBe(false);
  });

  it("overloaded will not evict from a locked table", () => {
    // A table can be locked AND over capacity at once — the host may have
    // locked it precisely because they intend to sort it out by hand.
    const guests = [g("A", { count: 8 }), g("B", { count: 8 })];
    const tables = [t("t1", 10)];
    const seat   = { A: "t1", B: "t1" };
    expect(find(generateSuggestions(guests, tables, [], seat, null, {}), "overloaded").canApply).toBe(true);
    expect(find(generateSuggestions(guests, tables, [], seat, null, locked(["t1"])), "overloaded").canApply).toBe(false);
  });

  it("isolated_guest will not move a guest out of a locked table", () => {
    const guests = [g("A"), g("B"), g("C", { group: "חברים" })];
    const tables = [t("t1", 10), t("t2", 10)];
    const seat   = { A: "t1", B: "t2", C: "t2" };   // A alone from משפחה at t1
    const base = find(generateSuggestions(guests, tables, [], seat, null, {}), "isolated_guest");
    expect(base?.canApply).toBe(true);
    // t1 is where A currently sits — the source.
    expect(find(generateSuggestions(guests, tables, [], seat, null, locked(["t1"])), "isolated_guest").canApply).toBe(false);
  });
});

describe("the quality score's weights are part of the contract", () => {
  // Both of these survived the mutation run: the penalty could be re-weighted,
  // and the unassigned cap removed, with the suite still green.
  const guests = [g("A"), g("B")];
  const tables = [t("t1", 10), t("t2", 10)];

  it("a broken together constraint costs exactly 15", () => {
    const cons = [together("A", "B")];
    const seat = { A: "t1", B: "t2" };
    const viol = computeViolations(guests, tables, cons, seat);
    expect(viol).toHaveLength(1);
    expect(computeQualityScore(guests, tables, cons, seat, viol)).toBe(
      computeQualityScore(guests, tables, [], seat, []) - 15
    );
  });

  it("the unassigned penalty is capped at 20 however many are waiting", () => {
    // Uncapped, 10 waiting seats would take 30 points. The cap is what keeps a
    // half-finished arrangement from reading as a disaster.
    const many = [g("seated"), ...Array.from({ length: 10 }, (_, i) => g("w" + i))];
    const seat = { seated: "t1" };
    const capped = computeQualityScore(many, tables, [], seat, []);
    const few = [g("seated"), g("w0"), g("w1")];
    const small = computeQualityScore(few, tables, [], { seated: "t1" }, []);
    // 2 waiting seats = 6 points; 10 waiting seats would be 30 uncapped.
    expect(small).toBeGreaterThan(capped);
    expect(100 - capped).toBeLessThanOrEqual(20 + 8);   // + the underfill cap
  });
});

// Seven mutants survived on computeQualityScore — every penalty could be
// changed or removed with the suite green. The score is the number the host
// reads to decide whether the arrangement is finished, so an unpinned model is
// a number that can drift without anyone noticing.
describe("computeQualityScore — each penalty is worth what it says", () => {
  const gs = n => Array.from({ length: n }, (_, i) =>
    ({ id: "g" + i, name: "א" + i, side: "bride", group: "משפחה", count: 1 }));
  // The 5th argument is the violations list — the caller computes it once and
  // passes it in, so a test that omits it silently scores against `undefined`.
  const score = (guests, tables, constraints, seating) =>
    computeQualityScore(guests, tables, constraints, seating,
                        computeViolations(guests, tables, constraints, seating));

  it("is null, not a number, when nobody is seated at all", () => {
    // 91 out of 100 for an empty room is worse than no answer.
    expect(score(gs(3), [t("t1", 10)], [], {})).toBeNull();
  });

  it("is 100 for a clean arrangement", () => {
    const g = gs(5);
    const seating = Object.fromEntries(g.map(x => [x.id, "t1"]));
    expect(score(g, [t("t1", 5)], [], seating)).toBe(100);
  });

  it("charges 15 for a broken apart constraint, the same as a broken together", () => {
    const g = gs(5);
    const seating = Object.fromEntries(g.map(x => [x.id, "t1"]));
    const apart    = [{ id: "c1", type: "apart",    guestA: "g0", guestB: "g1" }];
    expect(score(g, [t("t1", 5)], apart, seating)).toBe(85);

    const two = [t("t1", 5), t("t2", 5)];
    const split = { ...seating, g1: "t2" };
    const together = [{ id: "c1", type: "together", guestA: "g0", guestB: "g1" }];
    // Same 15, minus whatever the now-underfilled second table costs.
    expect(score(g, two, together, split)).toBeLessThanOrEqual(85);
  });

  it("charges 10 for an overbooked table", () => {
    const g = gs(6);
    const seating = Object.fromEntries(g.map(x => [x.id, "t1"]));
    expect(score(g, [t("t1", 5)], [], seating)).toBe(90);
  });

  it("caps the unseated penalty at 20 however many are left standing", () => {
    const g = gs(40);
    const seating = { g0: "t1" };   // one seated, thirty-nine not
    expect(score(g, [t("t1", 40)], [], seating)).toBe(100 - 20 - 2);
  });

  // A guest who said no does not need a chair, and must not make the plan look
  // worse for not having one.
  it("does not charge for a declined guest having no seat", () => {
    const g = gs(5).map((x, i) => (i === 4 ? { ...x, rsvp: "declined" } : x));
    const seating = Object.fromEntries(g.slice(0, 4).map(x => [x.id, "t1"]));
    expect(score(g, [t("t1", 4)], [], seating)).toBe(100);
  });

  it("caps the underfilled-table penalty at 8", () => {
    const g = gs(10);
    const tables = Array.from({ length: 10 }, (_, i) => t("t" + i, 20));
    const seating = Object.fromEntries(g.map((x, i) => [x.id, "t" + i]));
    // Ten tables at 1/20 each: 2 apiece would be 20, capped at 8.
    expect(score(g, tables, [], seating)).toBe(92);
  });

  // The threshold matters as much as the penalty. A table at half capacity is
  // an ordinary table, not a defect — and a fixture that is under BOTH the real
  // threshold and a widened one cannot tell them apart, which is how the first
  // version of this block missed it.
  it("does not charge for a table that is merely half full", () => {
    const g = gs(5);
    const seating = Object.fromEntries(g.map(x => [x.id, "t1"]));
    expect(score(g, [t("t1", 10)], [], seating)).toBe(100);   // 50% — fine
  });

  it("charges for a table that is nearly empty", () => {
    const g = gs(2);
    const seating = Object.fromEntries(g.map(x => [x.id, "t1"]));
    expect(score(g, [t("t1", 10)], [], seating)).toBe(98);    // 20% — 2 off
  });

  it("never goes below zero, however broken the plan is", () => {
    const g = gs(4);
    const seating = Object.fromEntries(g.map(x => [x.id, "t1"]));
    const many = Array.from({ length: 10 }, (_, i) =>
      ({ id: "c" + i, type: "apart", guestA: "g" + (i % 4), guestB: "g" + ((i + 1) % 4) }));
    const out = score(g, [t("t1", 2)], many, seating);
    expect(out).toBeGreaterThanOrEqual(0);
    expect(out).toBe(0);
  });
});
