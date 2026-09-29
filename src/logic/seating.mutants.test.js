import { describe, it, expect } from "vitest";
import { autoAssign, computeViolations } from "./seating.js";

// Four edits to the seating engine passed the whole suite in the third-review
// mutation run (29.9) — including the stress and fuzz suites, which check
// capacity, locks and constraints and are, correctly, indifferent to WHICH
// valid table a guest lands on. These four are exactly about which table: the
// affinity that sits a guest with people they know, and the tie-break that
// keeps a family together when the host's locks pull it two ways.
//
// Every scenario uses LOCKED guests to fix the room before the engine chooses,
// so the only decision left is the one under test.

const G = (id, side, group, count = 1) => ({ id, name: id, side, group, count, rsvp: "confirmed" });
const T = (id, capacity = 10) => ({ id, name: id, capacity });

describe("affinity: same side AND same group outweighs merely the same side", () => {
  // A friend from the army should sit with the army friend, not with two
  // cousins from the same side they have never met. The bonus is 3 for
  // side+group and 1 for side alone — so one army friend (3) beats two
  // same-side strangers (2). At 1 and 1 the two strangers won.
  it("X (bride, army) joins the one army friend over two bride-side cousins", () => {
    const guests = [G("army1", "bride", "army"), G("cous1", "bride", "family"), G("cous2", "bride", "family"),
                    G("X", "bride", "army")];
    const locked = { army1: "T1", cous1: "T2", cous2: "T2" };
    const out = autoAssign(guests, [T("T2"), T("T1")], [], locked);
    expect(out.X).toBe("T1");
  });
  // And side alone still counts: with no group match anywhere, a bride-side
  // guest goes to the bride-side table, not to the first table in the list.
  it("X (bride) joins the bride-side table over a groom-side one listed first", () => {
    const guests = [G("b1", "bride", "family"), G("g1", "groom", "work"), G("X", "bride", "army")];
    const out = autoAssign(guests, [T("TG"), T("TB")], [], { b1: "TB", g1: "TG" });
    expect(out.X).toBe("TB");
  });
});

describe("a family pulled two ways by locks follows where MOST of it already sits", () => {
  // The host locked L1 at T1 and L2 at T2, and bound X to L1 and Y, W to L2 —
  // and X, Y, W, Z are one family (a chain of "together"). The engine may not
  // move anyone locked, so one "together" will break whatever it does. Z has to
  // go where two of the family already are (T2), not where one is (T1): the
  // first breaks one pair, the second breaks two. T1 has MORE room, so a sort
  // on room alone would pick the wrong one — only the "most of the cluster
  // here" rule gets it right.
  it("Z sits at T2, with Y and W", () => {
    const guests = [G("L1", "bride", "f"), G("L2", "bride", "f"),
                    G("X", "bride", "f"), G("Y", "bride", "f"), G("W", "bride", "f"), G("Z", "bride", "f")];
    const tog = (a, b) => ({ id: a + b, type: "together", guestA: a, guestB: b });
    const constraints = [tog("X", "L1"), tog("Y", "L2"), tog("W", "L2"), tog("X", "Y"), tog("Y", "W"), tog("W", "Z")];
    const tables = [T("T1", 10), T("T2", 6)];
    const out = autoAssign(guests, tables, constraints, { L1: "T1", L2: "T2" });
    expect(out.Z).toBe("T2");
    const broken = computeViolations(guests, tables, constraints, out).filter(v => v.type === "together");
    expect(broken).toHaveLength(1);
  });
});

describe("a lock entry with no table is not a lock", () => {
  // SeatingScreen builds lockedSeating from `seating` filtered by lockedGuests,
  // and seating is not sanitised — a locked guest whose seat is empty ("" or
  // null, from an import or an older payload) arrives here as { g1: null }.
  // Treating that as locked removed g1 from the pool: never seated by
  // "חשבו מחדש", and written back as seating { g1: null }.
  it("{ g1: null } → g1 is seated like anyone else", () => {
    const out = autoAssign([G("g1", "bride", "f"), G("g2", "bride", "f")], [T("T1")], [], { g1: null });
    expect(out.g1).toBe("T1");
    expect(out.g2).toBe("T1");
  });
});
