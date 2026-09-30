import { describe, it, expect } from "vitest";
import { dndAnnouncements } from "./dndAnnouncements.js";

/* Fourth review 30.9: screen readers heard "Draggable item 216529ae-… was
 * dropped over droppable area table-0cdce103-…". */
const a = dndAnnouncements([{ id: "g1", name: "משפחת לוי" }], [{ id: "t1", name: "3" }, { id: "t2", name: "שולחן הכלה" }]);
const HEB_ONLY = /^[^A-Za-z]*$/;

describe("drag announcements", () => {
  it("name the guest and the table, in Hebrew, with no ids", () => {
    const said = [
      a.onDragStart({ active: { id: "g1" } }),
      a.onDragOver({ active: { id: "g1" }, over: { id: "table-t1" } }),
      a.onDragEnd({ active: { id: "g1" }, over: { id: "table-t2" } }),
      a.onDragEnd({ active: { id: "g1" }, over: { id: "unassigned" } }),
      a.onDragEnd({ active: { id: "g1" }, over: null }),
      a.onDragCancel({ active: { id: "g1" } }),
    ];
    for (const s of said) { expect(s).toMatch(HEB_ONLY); expect(s).toContain("משפחת לוי"); }
    expect(said[1]).toContain("שולחן 3");
    expect(said[2]).toContain("שולחן הכלה");
    expect(said[2]).not.toContain("שולחן שולחן");
  });
});

describe("the drop announcement says what happened (fifth review 30.9)", () => {
  const guests = [{ id: "g1", name: "פנינה", count: 2 }, { id: "g2", name: "יוסף", count: 9 }];
  const tables = [{ id: "t1", name: "1", capacity: 10 }, { id: "t2", name: "2", capacity: 10 }];
  const a = dndAnnouncements(guests, tables, { g2: "t1" });
  it("a full table: not seated", () => {
    const s = a.onDragEnd({ active: { id: "g1" }, over: { id: "table-t1" } });
    expect(s).toContain("מלא");
    expect(s).not.toContain("הושבה ב");
  });
  it("an unseated guest dropped on the waiting list: unchanged", () => {
    expect(a.onDragEnd({ active: { id: "g1" }, over: { id: "unassigned" } })).toContain("לא השתנתה");
  });
  it("the guest's own table: unchanged; a free table: seated", () => {
    expect(a.onDragEnd({ active: { id: "g2" }, over: { id: "table-t1" } })).toContain("לא השתנתה");
    expect(a.onDragEnd({ active: { id: "g1" }, over: { id: "table-t2" } })).toContain("הושבה בשולחן 2");
  });
});
