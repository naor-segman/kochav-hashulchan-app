import { describe, it, expect } from "vitest";
import {
  buildImportRows, editImportRow, removeImportRow,
  importSummary, readyImportRows, existingKeysOf, IMPORT_WARNINGS,
} from "./importReview.js";
import { parseGuestList } from "./parseGuestList.js";

// The review screen is what makes an imperfect parser safe. These pin the rules
// it runs on, so the screen can be changed without the rules moving with it.

const guest = (name, phone = "") => ({ id: name, name, phone, count: 1 });

describe("buildImportRows", () => {
  it("gives every row a stable id, not its index", () => {
    // Keying on the index means that after deleting row 1, editing "row 3"
    // edits a different person than the one under the host's finger.
    const rows = buildImportRows(parseGuestList("דנה\nיוסי\nמיכל"));
    expect(new Set(rows.map(r => r.id)).size).toBe(3);
    const left = removeImportRow(rows, rows[0].id);
    expect(left.map(r => r.name)).toEqual(["יוסי", "מיכל"]);
    expect(left[1].id).toBe(rows[2].id);          // מיכל keeps her id
  });

  it("carries name, phone, seats and companions through", () => {
    const [row] = buildImportRows(parseGuestList("דנה כהן 0501234567 +2 (יוסי, מיכל)"));
    expect(row).toMatchObject({
      name: "דנה כהן", phone: "0501234567", count: 3, companions: ["יוסי", "מיכל"],
    });
  });

  it("survives junk without throwing", () => {
    expect(buildImportRows(null)).toEqual([]);
    expect(buildImportRows([{}])[0]).toMatchObject({ name: "", phone: "", count: 1 });
  });
});

describe("the warnings", () => {
  it("flags a guest who is already in the list, by phone OR by name", () => {
    // The second paste of the same WhatsApp thread must not double everybody.
    const existing = [guest("דנה כהן", "050-123-4567")];
    const byPhone = buildImportRows(parseGuestList("דנה אחרת 0501234567"), existing);
    const byName  = buildImportRows(parseGuestList("דנה כהן"), existing);
    expect(byPhone[0].warnings).toContain("duplicate");
    expect(byName[0].warnings).toContain("duplicate");
  });

  it("does not flag someone genuinely new", () => {
    const rows = buildImportRows(parseGuestList("אבי ברק 0529876543"), [guest("דנה כהן", "0501234567")]);
    expect(rows[0].warnings).not.toContain("duplicate");
  });

  it("flags seats that have no names behind them", () => {
    // "+2" with no names is three seats and one person we can print a card for.
    const [row] = buildImportRows(parseGuestList("משפחת כהן +2"));
    expect(row.warnings).toContain("missingNames");
  });

  it("does NOT flag a row whose names are all there", () => {
    const [row] = buildImportRows(parseGuestList("משפחת כהן +2 (יוסי, מיכל)"));
    expect(row.warnings).not.toContain("missingNames");
  });

  it("treats a missing phone as information, not as a problem", () => {
    // Half of any real list has no phone. Painting two hundred rows amber for
    // it would make the colour mean nothing on the rows that matter.
    const [row] = buildImportRows(parseGuestList("דנה כהן"));
    expect(row.warnings).toContain("noPhone");
    expect(IMPORT_WARNINGS.noPhone.tone).toBe("info");
    expect(importSummary([row]).flagged).toBe(0);
  });
});

describe("editing a row", () => {
  const base = () => buildImportRows(parseGuestList("משפחת כהן +3 (יוסי, מיכל)"));

  it("fixing the name clears nothing else", () => {
    const rows = editImportRow(base(), "imp-0", { name: "משפחת לוי" });
    expect(rows[0]).toMatchObject({ name: "משפחת לוי", count: 4, companions: ["יוסי", "מיכל"] });
  });

  it("normalises a phone the host types by hand", () => {
    expect(editImportRow(base(), "imp-0", { phone: "050-123-4567" })[0].phone).toBe("0501234567");
  });

  it("lowering the seats TRIMS the names, and says so by doing it in front of them", () => {
    const rows = editImportRow(base(), "imp-0", { count: 2 });
    expect(rows[0].count).toBe(2);
    expect(rows[0].companions).toEqual(["יוסי"]);
  });

  it("adding a name adds a seat — the host should not have to say it twice", () => {
    const rows = editImportRow(base(), "imp-0", { companions: ["יוסי", "מיכל", "גיל", "נועה"] });
    expect(rows[0].count).toBe(5);
    expect(rows[0].companions).toHaveLength(4);
  });

  it("never lets companions outgrow the seats", () => {
    for (const patch of [{ count: 1 }, { count: 2 }, { companions: ["א", "ב", "ג"] }]) {
      const [row] = editImportRow(base(), "imp-0", patch);
      expect(row.companions.length).toBeLessThanOrEqual(row.count - 1);
    }
  });

  it("clamps a nonsense seat count instead of storing it", () => {
    expect(editImportRow(base(), "imp-0", { count: 0 })[0].count).toBe(1);
    expect(editImportRow(base(), "imp-0", { count: 900 })[0].count).toBe(50);
    expect(editImportRow(base(), "imp-0", { count: "לא מספר" })[0].count).toBe(1);
  });

  it("re-derives the warnings after every edit", () => {
    // Filling in the missing name must make the flag go away, or the host
    // fixes the row and the screen keeps telling them it is broken.
    const rows = editImportRow(base(), "imp-0", { companions: ["יוסי", "מיכל", "גיל"] });
    expect(rows[0].warnings).not.toContain("missingNames");
  });

  it("leaves every other row alone", () => {
    const rows = buildImportRows(parseGuestList("דנה\nיוסי"));
    const out  = editImportRow(rows, "imp-0", { name: "שונה" });
    expect(out[1]).toEqual(rows[1]);
  });
});

describe("the summary on the confirm button", () => {
  it("counts rows and SEATS separately", () => {
    // They differ the moment one line says "+2", and the seats are what the
    // tables have to hold.
    const rows = buildImportRows(parseGuestList("דנה +2\nיוסי 0501234567"));
    expect(importSummary(rows)).toMatchObject({ rows: 2, seats: 4, withPhone: 1 });
  });

  it("counts only the loud warnings as flagged", () => {
    const rows = buildImportRows(parseGuestList("משפחת כהן +2\nדנה כהן"));
    expect(importSummary(rows).flagged).toBe(1);      // missingNames, not noPhone
  });

  it("is safe on an empty list", () => {
    expect(importSummary([])).toEqual({ rows: 0, seats: 0, withPhone: 0, flagged: 0 });
  });
});

describe("readyImportRows", () => {
  it("drops a row the host blanked out rather than importing an empty guest", () => {
    const rows = editImportRow(buildImportRows(parseGuestList("דנה\nיוסי")), "imp-0", { name: "   " });
    expect(readyImportRows(rows).map(r => r.name)).toEqual(["יוסי"]);
  });
});

describe("existingKeysOf", () => {
  it("matches a phone however it was punctuated", () => {
    const keys = existingKeysOf([{ name: "דנה", phone: "050-123-4567" }]);
    expect(keys.phones.has("0501234567")).toBe(true);
  });

  it("ignores case and extra spaces in a name", () => {
    const keys = existingKeysOf([{ name: "  Dana   Cohen " }]);
    expect(keys.names.has("dana cohen")).toBe(true);
  });
});
