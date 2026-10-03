// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "../test/dom.js";
import NameTagsScreen from "./NameTagsScreen.jsx";

// סב35b/35c on the screen itself: the table card says how many names it
// could not fit, and the page count is the print geometry's, not a guess.
// (Measured in Chromium print-to-PDF: qa harness nt.mjs, recorded in the
// commit; jsdom has no layout, so this pins the decisions, not the paper.)

const guests = [...Array(30)].map((_, i) => ({ id: "g" + i, name: "אורח מספר " + i, count: 1, rsvp: "confirmed" }));
const EV = {
  id: "e1", name: "אירוע",
  guests,
  tables: [{ id: "t1", name: "שולחן 1", capacity: 30 }],
  seating: Object.fromEntries(guests.map(g => [g.id, "t1"])),
};

describe("NameTagsScreen print", () => {
  it("a table of 30 prints the names that fit and 'ועוד N' for the rest, on both faces", () => {
    const { container } = render(<NameTagsScreen activeEvent={EV} />);
    const lists = [...container.querySelectorAll("[class*='tentNames']")].map(e => e.textContent);
    expect(lists).toHaveLength(2);
    const m = lists[0].match(/ועוד (\d+)$/);
    expect(m).not.toBeNull();
    const shown = lists[0].split(" · ").length - 1;
    expect(shown + Number(m[1])).toBe(30);
  });

  it("the counts are the print geometry: 8 / 12 / 32 per page, exact", () => {
    const { container, getByText } = render(<NameTagsScreen activeEvent={EV} />);
    fireEvent.click(getByText("כרטיס מקום"));
    expect(container.textContent).toContain("8 בעמוד · 4 דפים");
    expect(container.textContent).not.toContain("בערך");
    fireEvent.click(getByText("תג שם"));
    expect(container.textContent).toContain("12 בעמוד · 3 דפים");
    fireEvent.click(getByText("מדבקה קטנה"));
    expect(container.textContent).toContain("32 בעמוד · דף אחד");
  });
});
