import { describe, it, expect, vi, beforeEach } from "vitest";

// The Excel export is what a host hands the venue and the caterer — the one
// artefact of this product that leaves it and is read by people who have never
// seen the app. Five edits to exportHelpers.js passed the whole suite in the
// third-review mutation run (29.9); each is pinned below by what the venue
// would have been handed.
//
// Same xlsx stub as exportHelpers.test.js: sheets captured as arrays of arrays,
// writeFile captured instead of touching the filesystem.
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
const base = (over = {}) => ({
  name: "החתונה של דנה", date: "2026-08-01",
  guests: [{ id: "a", name: "אבי", side: "bride", group: "משפחה", count: 2, rsvp: "confirmed" }],
  tables: [{ id: "t1", name: "1", capacity: 10, type: "knight" }],
  seating: { a: "t1" }, constraints: [], ...over,
});
const cells = () => sheets.flatMap(s => s.rows.flat()).map(String);

beforeEach(() => { sheets.length = 0; written = null; });

describe("the main workbook opens right-to-left", () => {
  // Without the view flag Excel opens a Hebrew workbook left-to-right: column A
  // (the table number) on the far left, every header reading backwards against
  // the data. The collab export sets it; the main one must too.
  it("Workbook.Views[0].RTL", async () => {
    await exportToExcel(base(), sideLabel, []);
    expect(written.wb.Workbook?.Views?.[0]?.RTL).toBe(true);
  });
});

describe("the filename survives an event name with a slash or a colon", () => {
  // "דנה/יוסי" and "אירוע 1.9: ערב" are ordinary event names. A slash in a
  // download name is a path separator and a colon is illegal on Windows, so
  // what gets saved is whatever each browser decides to make of it. Every
  // character in that set becomes "-", the same on every device.
  it("/ : ? * \" < > | become -", async () => {
    await exportToExcel(base({ name: 'דנה/יוסי: "ערב"?' }), sideLabel, []);
    expect(written.filename).toBe("דנה-יוסי- -ערב--.xlsx");
  });
});

describe("table types are Hebrew", () => {
  // The stored value is the English key ('knight'); the venue reads the label
  // ('אביר'). Printing the key is bug class 1 in the other direction.
  it("knight → אביר", async () => {
    await exportToExcel(base(), sideLabel, []);
    expect(cells()).toContain("אביר");
    expect(cells()).not.toContain("knight");
  });
});

describe("violation labels are not swapped", () => {
  // "apart" is a pair who must NOT sit together; "together" a pair who must.
  // Swapping the two labels tells the host the opposite of what is wrong —
  // they go looking for a missing pairing when the problem is two people who
  // should be apart.
  it("apart → הפרת הפרדה; together → הפרת ישיבה משותפת", async () => {
    await exportToExcel(base(), sideLabel, [
      { type: "apart", text: "A ו-B יושבים יחד" },
      { type: "together", text: "C ו-D לא יושבים יחד" },
    ]);
    const v = sheets.find(s => s.name === "הפרות אילוצים").rows;
    expect(v.find(r => r[1] === "A ו-B יושבים יחד")[0]).toBe("הפרת הפרדה");
    expect(v.find(r => r[1] === "C ו-D לא יושבים יחד")[0]).toBe("הפרת ישיבה משותפת");
  });
});

describe("the date is written the way a person reads it", () => {
  // "2026-08-01" is the storage format. In an RTL sheet it also renders as
  // 01-08-2026 read backwards; the Hebrew form cannot be misread.
  it("2026-08-01 → 1 באוגוסט 2026", async () => {
    await exportToExcel(base(), sideLabel, []);
    const first = sheets[0].rows;
    expect(first.find(r => r[0] === "תאריך:")[1]).toBe("1 באוגוסט 2026");
  });
});
