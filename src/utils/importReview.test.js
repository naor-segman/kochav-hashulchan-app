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

// parseGuestList de-dupes on `name|phone` deliberately — spouses share a
// household line — so the one shape it lets through is the same person once
// bare and once with a number, which is exactly what a WhatsApp export produces
// for an unsaved versus a saved contact. That arrived at the review screen with
// no warning at all, and both rows became guests: a phantom person and a
// phantom seat in the count the caterer is given.
describe("duplicates INSIDE one paste, not just against the existing list", () => {
  const parsed = [
    { name: "דוד לוי",  phone: "" },
    { name: "רונית כהן", phone: "0501111111" },
    { name: "דוד לוי",  phone: "0502222222" },
  ];

  it("flags the second occurrence and leaves the first clean", () => {
    const rows = buildImportRows(parsed, []);
    expect(rows[0].warnings).not.toContain("duplicate");
    expect(rows[1].warnings).not.toContain("duplicate");
    expect(rows[2].warnings).toContain("duplicate");
  });

  it("flags a repeated phone even when the names differ", () => {
    const rows = buildImportRows([
      { name: "משפחת כהן", phone: "050-111-1111" },
      { name: "יוסי כהן",  phone: "0501111111" },
    ], []);
    expect(rows[0].warnings).not.toContain("duplicate");
    expect(rows[1].warnings).toContain("duplicate");
  });

  it("still flags against guests already in the event", () => {
    const rows = buildImportRows([{ name: "דוד לוי", phone: "" }],
                                 [{ id: "g1", name: "דוד לוי", phone: "" }]);
    expect(rows[0].warnings).toContain("duplicate");
  });

  // Removing the FIRST of two identical rows must clear the flag from the one
  // that remains, or the host is left staring at a duplicate warning on the
  // only copy there is.
  it("clears the flag when the row it duplicated is removed", () => {
    const rows = buildImportRows(parsed, []);
    expect(rows[2].warnings).toContain("duplicate");
    const after = removeImportRow(rows, rows[0].id, []);
    expect(after).toHaveLength(2);
    expect(after.find(r => r.name === "דוד לוי").warnings).not.toContain("duplicate");
  });

  // And the other direction: an edit can create a duplicate that did not exist.
  it("raises the flag when an edit makes two rows the same", () => {
    const rows = buildImportRows(parsed.slice(0, 2), []);
    const after = editImportRow(rows, rows[1].id, { name: "דוד לוי" }, []);
    expect(after[1].warnings).toContain("duplicate");
    const back = editImportRow(after, after[1].id, { name: "רונית כהן" }, []);
    expect(back[1].warnings).not.toContain("duplicate");
  });
});
