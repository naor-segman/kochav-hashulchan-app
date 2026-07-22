import { describe, it, expect } from "vitest";
import { buildColumnMap, normalizeHeader, readCell } from "./guestImport.js";

describe("guestImport.buildColumnMap", () => {
  it("maps our own template headers", () => {
    const m = buildColumnMap({ "שם מלא": "", "כמות": "", "טלפון": "", "צד": "", "קבוצה": "", "הערות": "" });
    expect(m.name).toBe("שם מלא");
    expect(m.count).toBe("כמות");
    expect(m.phone).toBe("טלפון");
    expect(m.side).toBe("צד");
    expect(m.group).toBe("קבוצה");
    expect(m.notes).toBe("הערות");
  });

  it("maps varied real-world Hebrew headers", () => {
    const m = buildColumnMap({ "שם האורח": "", "מספר מוזמנים": "", "טלפון נייד": "", "צד משפחה": "" });
    expect(m.name).toBe("שם האורח");
    expect(m.count).toBe("מספר מוזמנים");
    expect(m.phone).toBe("טלפון נייד");
    expect(m.side).toBe("צד משפחה");
  });

  it("maps English headers", () => {
    const m = buildColumnMap({ "Full Name": "", "Qty": "", "Phone": "", "Group": "" });
    expect(m.name).toBe("Full Name");
    expect(m.count).toBe("Qty");
    expect(m.phone).toBe("Phone");
    expect(m.group).toBe("Group");
  });

  it("does not let one header serve two fields", () => {
    const m = buildColumnMap({ "שם": "", "טלפון": "" });
    expect(m.name).toBe("שם");
    expect(m.phone).toBe("טלפון");
    expect(m.count).toBeUndefined();
  });

  it("returns no name when there is no name-like column", () => {
    const m = buildColumnMap({ "מזהה": "", "עיר": "" });
    expect(m.name).toBeUndefined();
  });

  it("readCell returns empty string for absent columns", () => {
    const row = { "שם": "דנה" };
    const m = buildColumnMap(row);
    expect(readCell(row, m, "name")).toBe("דנה");
    expect(readCell(row, m, "phone")).toBe("");
  });

  it("normalizeHeader strips punctuation and case", () => {
    expect(normalizeHeader("  Full_Name ")).toBe("fullname");
    expect(normalizeHeader('טלפון נייד')).toBe("טלפוןנייד");
  });
});
