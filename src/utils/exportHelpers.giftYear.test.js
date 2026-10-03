import { describe, it, expect, vi } from "vitest";

// T5 — the declared-gifts sheet printed "1 ביוני, 22:00" with no year: a list
// kept past New Year cannot tell 3 January of one year from the next.

const sheets = [];
vi.mock("xlsx", () => ({
  utils: {
    book_new: () => ({ SheetNames: [], Sheets: {} }),
    aoa_to_sheet: rows => ({ __rows: rows }),
    book_append_sheet: (wb, ws, name) => { sheets.push({ name, rows: ws.__rows }); },
  },
  writeFile: () => {},
}));
const { exportToExcel } = await import("./exportHelpers.js");

describe("declared gifts sheet", () => {
  it("prints the year on each gift's time", async () => {
    const ev = { name: "e", guests: [], tables: [], seating: {}, constraints: [] };
    await exportToExcel(ev, () => "", [], [
      { donorName: "משפחת כהן", amountILS: 500, createdAt: "2026-12-31T20:00:00Z" },
      { donorName: "דני",       amountILS: 300, createdAt: "2027-01-03T10:00:00Z" },
    ]);
    const rows = sheets.find(s => s.name === "מתנות שהוצהרו").rows;
    const when = name => rows.find(r => r[0] === name)[3];
    expect(when("משפחת כהן")).toMatch(/2026|2027/);    // TZ-dependent which, but a year
    expect(when("דני")).toMatch(/2027/);
  });
});
