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
