import { describe, it, expect } from "vitest";
import { autoAssign, computeViolations } from "./seating.js";
import { autoRunMessage } from "./autoRunMessage.js";

// Every scenario is run through the REAL engine, then described — the five
// cases review 6.10 found the old message getting wrong, plus the plain ones.
const fam = (id, count, extra = {}) => ({ id, name: "משפחה " + id, count, rsvp: "confirmed", ...extra });
const tbl = (id, capacity) => ({ id, name: "שולחן " + id, capacity });

function run({ guests, tables, constraints = [], lockedSeating = {}, lockedTables = [] }) {
  const active = guests.filter(g => g.rsvp !== "declined");
  const passengers = guests.filter(g => g.rsvp === "declined" && lockedSeating[g.id]);
  const seating = autoAssign([...active, ...passengers], tables, constraints, lockedSeating, undefined, lockedTables);
  const violations = computeViolations(guests, tables, constraints, seating).length;
  return autoRunMessage({ active, allGuests: guests, tables, seating, lockedTables, constraints, violations }).text;
}

describe("autoRunMessage — names the real reason", () => {
  it("a family bigger than any table", () => {
    const t = run({ guests: [fam("big", 14)], tables: [tbl("a", 10), tbl("b", 10), tbl("c", 10)] });
    expect(t).toMatch(/"משפחה big" \(14 מקומות\) גדולים מכל שולחן/);
    expect(t).not.toMatch(/מפוזרים/);
  });

  it("free chairs only at a locked table are not called free", () => {
    const guests = [fam("x1", 1), fam("x2", 1), fam("f1", 5), fam("f2", 5), fam("f3", 5)];
    const t = run({ guests, tables: [tbl("t1", 10), tbl("t2", 10)],
      lockedSeating: { x1: "t1", x2: "t1" }, lockedTables: ["t1"] });
    expect(t).toMatch(/בשולחנות נעולים/);
  });

  it("singles held out by 'apart' rules are not told about families", () => {
    const guests = [fam("a", 1), fam("b", 1), fam("c", 1)];
    const constraints = [
      { id: "1", type: "apart", guestA: "a", guestB: "b" },
      { id: "2", type: "apart", guestA: "a", guestB: "c" },
      { id: "3", type: "apart", guestA: "b", guestB: "c" },
    ];
    const t = run({ guests, tables: [tbl("t1", 10), tbl("t2", 10)], constraints });
    expect(t).toMatch(/האילוצים לא מאפשרים/);
    expect(t).not.toMatch(/משפחה לא מתפצלת/);
  });

  it("an overbooked locked table does not cancel another table's free seats out of the shortfall", () => {
    // Guest L (13) locked at t1 (10): 3 over. t2 (10) takes two families of
    // 4 → 2 free. One family of 4 waits: 2 short, not 4 (capacity 20 − used
    // 21 cancelled t2's two chairs).
    const guests = [fam("L", 13), fam("f1", 4), fam("f2", 4), fam("f3", 4)];
    const t = run({ guests, tables: [tbl("t1", 10), tbl("t2", 10)], lockedSeating: { L: "t1" } });
    expect(t).toMatch(/חסרים עוד 2 מקומות/);
  });

  it("scattered seats with families: says so", () => {
    const guests = Array.from({ length: 82 }, (_, i) => fam("g" + i, 4));
    const tables = Array.from({ length: 35 }, (_, i) => tbl("t" + i, 10));
    expect(run({ guests, tables })).toMatch(/^שובצו 70 רשומות\. 12 לא נכנסו — יש 70 מקומות פנויים, אבל מפוזרים/);
  });

  it("singular forms: one row, one seat", () => {
    const t = run({ guests: [fam("a", 4), fam("b", 7)], tables: [tbl("t1", 10)] });
    expect(t).toMatch(/^שובצה רשומה אחת\. אחת לא נכנסה — /);
    const short = run({ guests: [fam("a", 9), fam("b", 2)], tables: [tbl("t1", 10)] });
    expect(short).toMatch(/חסר עוד מקום אחד\./);
    expect(short).not.toMatch(/1 מקומות/);
  });

  it("every table locked", () => {
    const t = run({ guests: [fam("a", 2)], tables: [tbl("t1", 10)], lockedTables: ["t1"] });
    expect(t).toMatch(/כל השולחנות נעולים/);
  });

  it("all seated: plain, or with the broken constraints counted", () => {
    expect(run({ guests: [fam("a", 2), fam("b", 2)], tables: [tbl("t1", 10)] })).toBe("כל 2 הרשומות שובצו ✓");
    expect(run({ guests: [fam("a", 2)], tables: [tbl("t1", 10)] })).toBe("הרשומה שובצה ✓");
  });
});
