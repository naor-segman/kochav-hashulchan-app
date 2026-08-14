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

// The seating sheet is one row per PARTY — that is the right shape for a plan
// you read table by table. But it printed "טל · 4" and named nobody, so the
// host got a number where they needed a guest list, exactly the complaint the
// shared table's export already answered. Same column, same clamp.
describe("exportToExcel — companions on the seating sheet", () => {
  const seatingRows = () => sheetNamed("סידור הושבה").rows;
  // The preamble is variable — the date and venue rows only exist when the
  // event has them — so the header is found, not counted to.
  const headIndex = () => seatingRows().findIndex(r => r[0] === "שולחן");
  const headerRow = () => seatingRows()[headIndex()];
  const col = label => headerRow().indexOf(label);

  it("has a companions column, and it names them", async () => {
    await exportToExcel(
      {
        name: "e",
        guests: [g("טל", { count: 3, companions: ["רונית", "יעל"] })],
        tables: [t("t1")], seating: { "טל": "t1" }, constraints: [],
      },
      sideLabel, []
    );
    const c = col("שמות המצטרפים");
    expect(c).toBeGreaterThan(-1);
    const guestRow = seatingRows().find(r => r[col("שם אורח")] === "טל");
    expect(guestRow[c]).toBe("רונית, יעל");
  });

  it("never names a companion who has no chair", async () => {
    await exportToExcel(
      {
        name: "e",
        guests: [g("טל", { count: 2, companions: ["רונית", "יוסי", "דנה"] })],
        tables: [t("t1")], seating: { "טל": "t1" }, constraints: [],
      },
      sideLabel, []
    );
    const guestRow = seatingRows().find(r => r[col("שם אורח")] === "טל");
    expect(guestRow[col("שמות המצטרפים")]).toBe("רונית");
  });

  // A row shorter than the header does not fail loudly — it silently shifts
  // every column after it, which is how a workbook lies.
  it("keeps every seating row as wide as the header, empty tables included", async () => {
    await exportToExcel(
      {
        name: "e",
        guests: [g("טל", { count: 2, companions: ["רונית"] })],
        tables: [t("t1"), t("t2")], seating: { "טל": "t1" }, constraints: [],
      },
      sideLabel, []
    );
    const width = headerRow().length;
    const body  = seatingRows().slice(headIndex() + 1).filter(r => r.length > 0);
    expect(body.length).toBeGreaterThan(1);
    for (const r of body) expect(r.length).toBe(width);
  });

  it("carries the same column on the waiting-list sheet", async () => {
    await exportToExcel(
      {
        name: "e",
        guests: [g("טל", { count: 2, companions: ["רונית"] })],
        tables: [t("t1")], seating: {}, constraints: [],
      },
      sideLabel, []
    );
    const rows = sheetNamed("ממתינים לשיבוץ").rows;
    const head = rows.find(r => r[0] === "שם אורח");
    const row  = rows.find(r => r[0] === "טל");
    expect(head).toContain("שמות המצטרפים");
    expect(row[head.indexOf("שמות המצטרפים")]).toBe("רונית");
    expect(row.length).toBe(head.length);
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
      guests_count: 9, companions: ["אבי", "בני", "גילי", "דנה", "הדס", "ורד", "זהר", "חן"],
      notes: "אלרגיה לאגוזים", updated_by: "רונית" },
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
    expect(complete[8]).toBe("מלאה — מסונכרנת");
    expect(incomplete[8]).toBe("חסר: טלפון, צד, קבוצה");
  });

  // The column the host used to have to ask for in a separate WhatsApp message.
  // It sits with the guest's own data (right after the companion names), which
  // is why the status column moved from index 7 to 8.
  it("carries the note the relative left", async () => {
    await exportCollabTableToExcel(collabRows, opts);
    expect(rowsOf()[0][6]).toBe("הערות");
    expect(rowsOf()[1][6]).toBe("אלרגיה לאגוזים");
    expect(rowsOf()[2][6]).toBe("");
  });

  it("carries who added the row, and the localised side", async () => {
    await exportCollabTableToExcel(collabRows, opts);
    expect(rowsOf()[1][2]).toBe("צד הכלה");
    expect(rowsOf()[1][7]).toBe("רונית");
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
  const full = { name: "א", phone: "05", side: "bride", guest_group: "חברים" };

  it("lists exactly the four fields the sync requires", () => {
    expect(collabRowMissing({})).toEqual(["שם", "טלפון", "צד", "קבוצה"]);
  });
  it("never reports the seat count, which always defaults to 1", () => {
    expect(collabRowMissing(full)).toEqual([]);
  });
  it("treats whitespace-only values as missing", () => {
    expect(collabRowMissing({ ...full, name: "   " })).toEqual(["שם"]);
  });

  // 12.8 — a seat with no name is counted twice: once as a chair, once as the
  // person it turns out to be. The row is still SAVED to the shared table (it
  // auto-saves as you type); what it does not do is enter the host's guest list.
  it("a named seat count of 1 needs no companion names", () => {
    expect(collabRowMissing({ ...full, guests_count: 1 })).toEqual([]);
  });
  it("names the specific empty box, matching the input labels", () => {
    expect(collabRowMissing({ ...full, guests_count: 2, companions: [] }))
      .toEqual(["שם המצטרף 1"]);
    expect(collabRowMissing({ ...full, guests_count: 4, companions: ["", "רונית"] }))
      .toEqual(["שמות המצטרפים (1, 3)"]);
  });
  it("a relationship word completes the row — that is the point", () => {
    expect(collabRowMissing({ ...full, guests_count: 2, companions: ["בעל"] })).toEqual([]);
  });
  it("does not demand names for seats the row no longer has", () => {
    expect(collabRowMissing({ ...full, guests_count: 1, companions: ["רונית", "טל"] })).toEqual([]);
  });
  it("reports the missing fields and the missing names together", () => {
    expect(collabRowMissing({ name: "א", guests_count: 2 }))
      .toEqual(["טלפון", "צד", "קבוצה", "שם המצטרף 1"]);
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

// ── From the 12.8 logic review ───────────────────────────────────────────────
describe("the occupancy cell — seats, and in an order a Hebrew reader can trust", () => {
  const ev = () => ({
    name: "e",
    guests: [g("a", { count: 5 })],
    tables: [t("t1", 12)],
    seating: { a: "t1" },
    constraints: [],
  });

  it("counts SEATS, not rows", async () => {
    // Mutant M21 — counting rows instead of `guestSeats` — survived the whole
    // suite. One row of five people would have reported the table as holding
    // one seat of twelve.
    await exportToExcel(ev(), sideLabel, []);
    const rows = sheetNamed("סידור הושבה").rows;
    const cell = rows.find(r => String(r[0]) === "t1")[3];
    expect(String(cell)).toContain("5");
    expect(String(cell)).not.toMatch(/^1 /);
  });

  it("uses 'מתוך' rather than a spaced slash in the RTL workbook", async () => {
    // See the comment at the call site: the two forms are geometrically
    // identical and the reading order of "5 / 12" was never wrong. What the
    // Hebrew word buys is that the cluster on screen — "12 מתוך 5" — cannot be
    // mistaken for an LTR fraction the way "12 / 5" can. A convention, pinned
    // so it does not drift back, not a measured defect.
    await exportToExcel(ev(), sideLabel, []);
    const rows = sheetNamed("סידור הושבה").rows;
    const cell = String(rows.find(r => String(r[0]) === "t1")[3]);
    expect(cell).toBe("5 מתוך 12");
    expect(cell).not.toContain(" / ");
  });
});

describe("the entrance sheet is the door list, so a refusal must not be on it", () => {
  it("excludes declined guests", async () => {
    // Mutant M22 — dropping the `declined` filter — survived the suite, and
    // the comment above that filter describes a real reconciliation bug it was
    // added to fix. A greeter handed a list with a refusal on it either checks
    // in somebody who is not coming, or stands at the door arguing about it.
    const ev = {
      name: "e",
      guests: [g("בא", { count: 1 }), g("לא בא", { rsvp: "declined" })],
      tables: [t("t1")],
      seating: { "בא": "t1", "לא בא": "t1" },
      constraints: [],
    };
    await exportToExcel(ev, sideLabel, []);
    const entrance = sheetNamed("רשימת כניסה א׳-ב׳");
    expect(entrance).toBeTruthy();
    const text = entrance.rows.flat().join(" | ");
    expect(text).toContain("בא");
    expect(text).not.toContain("לא בא");
  });
});

// arrival.js was rewritten so arrival is per PERSON (`arrivedSeats`), keeping
// `arrived` as a truthful "someone on this row came" mirror. Sheet 6 kept
// reading that boolean as if it meant the whole row, and this is the report the
// host reconciles gifts against the morning after — the one place the number
// has to be right. Same defect CLAUDE.md records for the door header, which
// showed 0/6 at an event with sixty people in the room.
describe("the gift report counts PEOPLE in the room, not rows with someone in them", () => {
  const family = (id, count, arrivedSeats, gift) =>
    g(id, { count, arrivedSeats, arrived: arrivedSeats.length > 0, giftAmount: gift });

  // 2 of 4 in, 1 of 4 in, 0 of 1 in → three people are in the room.
  const ev = {
    name: "החתונה", date: "2027-06-01",
    guests: [family("משפחת כהן", 4, [0, 1], 1000),
             family("משפחת לוי", 4, [0],    500),
             family("דודה רחל",  1, [],       0)],
    tables: [t("t1", 12)],
    seating: { "משפחת כהן": "t1", "משפחת לוי": "t1", "דודה רחל": "t1" },
    constraints: [],
  };

  const giftSheet = () => sheets.find(s => /מתנ/.test(s.name));

  it("puts the seat count in the summary, not the row count", async () => {
    await exportToExcel(ev, sideLabel, []);
    const summary = giftSheet().rows.find(r => r.includes("סה״כ הגיעו:"));
    // Rows with someone in them: 2. People actually in the room: 3.
    expect(summary[summary.indexOf("סה״כ הגיעו:") + 1]).toBe(3);
  });

  // "כמות 4" beside a bare ✓ reads as "all four came" for a family where one
  // did — on one line, in the column the host scans.
  it("shows arrived-of-total for a partly arrived family, and ✓ only for a full one", async () => {
    await exportToExcel(ev, sideLabel, []);
    const rows = giftSheet().rows;
    const row = name => rows.find(r => r[0] === name);
    expect(row("משפחת כהן")[3]).toBe("2 מתוך 4");
    expect(row("משפחת לוי")[3]).toBe("1 מתוך 4");
    expect(row("דודה רחל")[3]).toBe("");
  });

  it("still writes a plain ✓ when every seat on the row arrived", async () => {
    await exportToExcel({ ...ev, guests: [family("זוג שלם", 2, [0, 1], 0)] }, sideLabel, []);
    expect(giftSheet().rows.find(r => r[0] === "זוג שלם")[3]).toBe("✓");
  });

  // Legacy rows written before arrivedSeats existed carry only the boolean.
  it("understands a legacy row that has arrived but no arrivedSeats", async () => {
    await exportToExcel({
      ...ev, guests: [g("ישן", { count: 3, arrived: true, giftAmount: 200 })],
    }, sideLabel, []);
    const summary = giftSheet().rows.find(r => r.includes("סה״כ הגיעו:"));
    expect(summary[summary.indexOf("סה״כ הגיעו:") + 1]).toBe(3);
    expect(giftSheet().rows.find(r => r[0] === "ישן")[3]).toBe("✓");
  });
});
