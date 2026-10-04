// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MemoryRouter } from "react-router-dom";
import { render } from "../../test/dom.js";
import EventDayServiceScreen from "./EventDayServiceScreen.jsx";
import { PER_PAGE } from "../../data/nameTagSizes.js";

/* Audit 3.10, C8: the event-day page said "שש-עשרה מדבקות בעמוד" while the
 * name-tag screen prints 32 stickers a sheet. The page now reads the number
 * from the same table the screen prints by; this pins both ends — the page
 * shows that table's numbers, and the table matches the print CSS. */
describe("event-day page quotes the name-tag print geometry (C8)", () => {
  it("the rendered page shows each perPage from data/nameTagSizes.js", () => {
    const { container } = render(<MemoryRouter><EventDayServiceScreen user={null} /></MemoryRouter>);
    const t = container.textContent;
    expect(t).toContain(`${PER_PAGE.tag} תגים או ${PER_PAGE.small} מדבקות בעמוד`);
    expect(t).toContain(`כרטיס מקום יוצא ${PER_PAGE.card} בעמוד, וכרטיס שולחן ${PER_PAGE.table}.`);
    expect(t).not.toMatch(/שש-עשרה|שנים-עשר תגים/);
  });

  it("the table is the print CSS's arithmetic (columns × rows)", () => {
    // The geometry comment in the print block is the stated contract; the rows
    // below are what it says, and perPage must equal columns × rows.
    const css = readFileSync(join(process.cwd(), "src/screens/NameTagsScreen.module.css"), "utf8");
    const row = name => {
      const m = css.match(new RegExp(`${name}\\s+(\\d+) columns × (\\d+) rows[^=]*=\\s*(\\d+)`));
      return m && { product: Number(m[1]) * Number(m[2]), stated: Number(m[3]) };
    };
    for (const [name, key] of [["place cards", "card"], ["name tags", "tag"], ["small", "small"]]) {
      const r = row(name);
      expect(r, name).not.toBeNull();
      expect(r.product, name).toBe(r.stated);
      expect(PER_PAGE[key], name).toBe(r.stated);
    }
    expect(PER_PAGE.table).toBe(Number(css.match(/tents\s+2 × 138mm\s+=\s*(\d+)/)[1]));
  });
});
