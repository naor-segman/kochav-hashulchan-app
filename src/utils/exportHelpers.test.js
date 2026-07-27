import { describe, it, expect, vi, beforeEach } from "vitest";

// xlsx is dynamically imported inside exportToExcel and its writeFile would try
// to hit the filesystem, so the whole module is stubbed. The sheets are captured
// as plain arrays-of-arrays, which is exactly what we want to assert on.
const sheets = [];
let written = null;

vi.mock("xlsx", () => ({
  utils: {
    book_new: () => ({ SheetNames: [], Sheets: {} }),
    aoa_to_sheet: rows => ({ __rows: rows }),
    book_append_sheet: (wb, ws, name) => {
      wb.SheetNames.push(name);
      wb.Sheets[name] = ws;
      sheets.push({ name, rows: ws.__rows });
    },
  },
  writeFile: (wb, filename) => { written = { wb, filename }; },
}));

const { exportToExcel } = await import("./exportHelpers.js");

const sideLabel = s => (s === "bride" ? "כלה" : "חתן");
const g = (id, extra = {}) => ({
  id, name: id, side: "bride", group: "משפחה", count: 1, rsvp: "confirmed", ...extra,
});
const t = (id, capacity = 10) => ({ id, name: id, capacity, type: "regular" });

const sheetNamed = n => sheets.find(s => s.name === n);
const flat = n => (sheetNamed(n)?.rows || []).flat().join(" | ");

beforeEach(() => { sheets.length = 0; written = null; });

describe("exportToExcel — workbook shape", () => {
  it("always writes the seating sheet, named after the event", async () => {
    await exportToExcel(
      { name: "החתונה של דנה", date: "2026-08-01", guests: [g("a")], tables: [t("t1")], seating: { a: "t1" }, constraints: [] },
      sideLabel, []
    );
    expect(sheetNamed("סידור הושבה")).toBeTruthy();
    expect(written.filename).toContain("החתונה של דנה");
    expect(written.filename.endsWith(".xlsx")).toBe(true);
  });

  it("adds the waiting sheet only when someone is unseated", async () => {
    const ev = { name: "e", guests: [g("a"), g("b")], tables: [t("t1")], seating: { a: "t1" }, constraints: [] };
    await exportToExcel(ev, sideLabel, []);
    expect(sheetNamed("ממתינים לשיבוץ")).toBeTruthy();
    expect(flat("ממתינים לשיבוץ")).toContain("b");

    sheets.length = 0;
    await exportToExcel({ ...ev, seating: { a: "t1", b: "t1" } }, sideLabel, []);
    expect(sheetNamed("ממתינים לשיבוץ")).toBeUndefined();
  });

  it("adds the violations sheet only when violations are passed in", async () => {
    const ev = { name: "e", guests: [g("a"), g("b")], tables: [t("t1")], seating: { a: "t1", b: "t1" }, constraints: [] };
    await exportToExcel(ev, sideLabel, []);
    expect(sheetNamed("הפרות אילוצים")).toBeUndefined();

    sheets.length = 0;
    await exportToExcel(ev, sideLabel, [{ type: "apart", guestA: "a", guestB: "b", tableA: "t1", tableB: "t1" }]);
    expect(sheetNamed("הפרות אילוצים")).toBeTruthy();
  });

  it("adds the gift report only when a gift was actually recorded", async () => {
    const base = { name: "e", tables: [t("t1")], seating: { a: "t1" }, constraints: [] };
    await exportToExcel({ ...base, guests: [g("a")] }, sideLabel, []);
    expect(sheetNamed("דוח מתנות")).toBeUndefined();

    sheets.length = 0;
    await exportToExcel({ ...base, guests: [g("a", { giftAmount: 500 })] }, sideLabel, []);
    expect(sheetNamed("דוח מתנות")).toBeTruthy();
    expect(flat("דוח מתנות")).toContain("500");
  });
});

describe("exportToExcel — seat expansion (entrance list)", () => {
  it("writes one row per physical seat, not one per guest row", async () => {
    await exportToExcel(
      {
        name: "e",
        guests: [g("טל", { count: 3, companions: ["רונית"] })],
        tables: [t("t1")], seating: { "טל": "t1" }, constraints: [],
      },
      sideLabel, []
    );
    // The seating sheet stays one row per party...
    expect(flat("סידור הושבה")).toContain("טל");
    // ...while the entrance list expands every individual seat.
    const entrance = flat("רשימת כניסה א׳-ב׳");
    expect(entrance).toContain("רונית (טל)"); // named companion
    expect(entrance).toContain("טל +1");       // remaining unnamed seat
  });

  it("never inflates a party beyond its count", async () => {
    await exportToExcel(
      {
        name: "e",
        guests: [g("טל", { count: 2, companions: ["רונית", "יוסי", "דנה"] })],
        tables: [t("t1")], seating: { "טל": "t1" }, constraints: [],
      },
      sideLabel, []
    );
    const entrance = flat("רשימת כניסה א׳-ב׳");
    expect(entrance).toContain("רונית (טל)");
    expect(entrance).not.toContain("יוסי");
    expect(entrance).not.toContain("דנה");
  });
});

describe("exportToExcel — translations", () => {
  it("renders RSVP and meal codes in Hebrew, falling back for unknown values", async () => {
    await exportToExcel(
      {
        name: "e",
        guests: [
          g("a", { rsvp: "declined", meal: "vegan" }),
          g("b", { rsvp: "weird",    meal: "weird" }),
        ],
        tables: [t("t1")], seating: { a: "t1", b: "t1" }, constraints: [],
      },
      sideLabel, []
    );
    const all = sheets.map(s => s.rows.flat().join(" | ")).join(" || ");
    expect(all).toContain("סירב/ה");
    expect(all).toContain("טבעוני");
    expect(all).toContain("ממתין"); // unknown rsvp falls back
    expect(all).toContain("רגיל");  // unknown meal falls back
  });
});
