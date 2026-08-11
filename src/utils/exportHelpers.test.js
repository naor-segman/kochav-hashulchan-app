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

const { exportToExcel, exportCollabTableToExcel, collabRowMissing } =
  await import("./exportHelpers.js");

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

// The shared collaborative table. Both screens that offer to download it now go
// through this one builder — the whole point is that they cannot drift into
// exporting different datasets under the same label again.
describe("exportCollabTableToExcel", () => {
  const sideLabels = { bride: "צד הכלה", groom: "צד החתן" };
  const opts = { eventName: "חתונת נועה וטל", sideLabels };
  const collabRows = [
    { id: "r1", name: "יעל כהן", phone: "0501112222", side: "bride", guest_group: "משפחה קרובה",
      guests_count: 9, companions: ["אבי", "בני", "גילי", "דנה", "הדס", "ורד", "זהר", "חן"], updated_by: "רונית" },
    { id: "r2", name: "משה לוי", phone: "", side: null, guest_group: null, guests_count: 1, companions: [] },
  ];
  const rowsOf = () => sheetNamed("טבלה שיתופית").rows;

  it("writes the companion names — the reason the table exists", async () => {
    await exportCollabTableToExcel(collabRows, opts);
    const r = rowsOf()[1];
    expect(r[0]).toBe("יעל כהן");
    expect(r[4]).toBe(9);
    // Before this existed the sheet said "9" and named nobody.
    expect(r[5]).toBe("אבי, בני, גילי, דנה, הדס, ורד, זהר, חן");
  });

  it("never prints a companion who has no chair", async () => {
    await exportCollabTableToExcel(
      [{ id: "r", name: "טל", guests_count: 2, companions: ["רונית", "יוסי", "דנה"] }], opts);
    expect(rowsOf()[1][5]).toBe("רונית");
  });

  it("says which rows are still incomplete instead of printing them as equals", async () => {
    await exportCollabTableToExcel(collabRows, opts);
    const [, complete, incomplete] = rowsOf();
    expect(complete[7]).toBe("מלאה — מסונכרנת");
    expect(incomplete[7]).toBe("חסר: טלפון, צד, קבוצה");
  });

  it("carries who added the row, and the localised side", async () => {
    await exportCollabTableToExcel(collabRows, opts);
    expect(rowsOf()[1][2]).toBe("צד הכלה");
    expect(rowsOf()[1][6]).toBe("רונית");
  });

  it("sets workbook RTL, so a Hebrew sheet does not open left-to-right", async () => {
    await exportCollabTableToExcel(collabRows, opts);
    expect(written.wb.Workbook).toEqual({ Views: [{ RTL: true }] });
  });

  it("uses a filename of its own — not the one two other exports already use", async () => {
    await exportCollabTableToExcel(collabRows, opts);
    expect(written.filename).toBe("טבלה-שיתופית-חתונת נועה וטל.xlsx");
    expect(written.filename.startsWith("אורחים-")).toBe(false);
  });

  it("survives an empty table and a missing event name", async () => {
    await exportCollabTableToExcel([], {});
    expect(rowsOf()).toHaveLength(1); // header only
    expect(written.filename).toBe("טבלה-שיתופית-אירוע.xlsx");
  });
});

describe("collabRowMissing", () => {
  it("lists exactly the four fields the sync requires", () => {
    expect(collabRowMissing({})).toEqual(["שם", "טלפון", "צד", "קבוצה"]);
  });
  it("never reports the seat count, which always defaults to 1", () => {
    expect(collabRowMissing({ name: "א", phone: "05", side: "bride", guest_group: "חברים" })).toEqual([]);
  });
  it("treats whitespace-only values as missing", () => {
    expect(collabRowMissing({ name: "   ", phone: "05", side: "bride", guest_group: "חברים" })).toEqual(["שם"]);
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
