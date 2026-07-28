import { describe, it, expect } from "vitest";
import { parseGuestList, normalizePhone, countWithPhone } from "./parseGuestList.js";

describe("normalizePhone", () => {
  it("normalises every way an Israeli number gets written", () => {
    expect(normalizePhone("050-123-4567")).toBe("0501234567");
    expect(normalizePhone("+972 50 123 4567")).toBe("0501234567");
    expect(normalizePhone("972501234567")).toBe("0501234567");
    expect(normalizePhone("0501234567")).toBe("0501234567");
    expect(normalizePhone("501234567")).toBe("0501234567");
  });
  it("returns empty for nothing usable", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone("אין")).toBe("");
  });
});

describe("parseGuestList", () => {
  it("still handles a plain list of names", () => {
    expect(parseGuestList("דוד לוי\nשרה כהן")).toEqual([
      { name: "דוד לוי", phone: "" },
      { name: "שרה כהן", phone: "" },
    ]);
  });

  it("picks up a phone after a comma or a dash", () => {
    expect(parseGuestList("דוד לוי, 050-1234567")).toEqual([{ name: "דוד לוי", phone: "0501234567" }]);
    expect(parseGuestList("שרה כהן - 0521234567")).toEqual([{ name: "שרה כהן", phone: "0521234567" }]);
  });

  it("reads a tab-separated spreadsheet column", () => {
    expect(parseGuestList("דוד לוי\t+972 50 123 4567")).toEqual([{ name: "דוד לוי", phone: "0501234567" }]);
  });

  it("handles the phone coming first", () => {
    expect(parseGuestList("0501234567 דוד לוי")).toEqual([{ name: "דוד לוי", phone: "0501234567" }]);
  });

  it("strips the ~ WhatsApp puts before unsaved contacts", () => {
    expect(parseGuestList("~משפחת אברהם")).toEqual([{ name: "משפחת אברהם", phone: "" }]);
  });

  it("strips list numbering and bullets", () => {
    expect(parseGuestList("1. דוד לוי\n• שרה כהן")).toEqual([
      { name: "דוד לוי", phone: "" },
      { name: "שרה כהן", phone: "" },
    ]);
  });

  it("skips blank lines and lines with no name at all", () => {
    expect(parseGuestList("דוד לוי\n\n   \n0501234567")).toEqual([{ name: "דוד לוי", phone: "" }]);
  });

  it("collapses the same person pasted twice", () => {
    const rows = parseGuestList("דוד לוי, 0501234567\nדוד לוי, 050-123-4567\nשרה כהן");
    expect(rows).toHaveLength(2);
  });

  it("survives empty and missing input", () => {
    expect(parseGuestList("")).toEqual([]);
    expect(parseGuestList(undefined)).toEqual([]);
    expect(parseGuestList(null)).toEqual([]);
  });
});

describe("countWithPhone", () => {
  it("counts only the rows that actually carry a number", () => {
    expect(countWithPhone(parseGuestList("א, 0501234567\nב\nג, 0521234567"))).toBe(2);
    expect(countWithPhone([])).toBe(0);
    expect(countWithPhone(undefined)).toBe(0);
  });
});

// ── Regressions from the full-codebase audit (28.7) ──────────────────────────
describe("Hebrew abbreviations and foreign numbers", () => {
  it("keeps gershayim inside an honorific", () => {
    // Stripping every double quote turned ד"ר into דר and עו"ד into עוד
    // ("more") — and that is what printed on the name tag.
    expect(parseGuestList('ד"ר כהן, 0501234567')[0].name).toBe('ד"ר כהן');
    expect(parseGuestList('עו"ד שרה לוי, 0521234567')[0].name).toBe('עו"ד שרה לוי');
  });

  it("still keeps a geresh, which was the original fix", () => {
    expect(parseGuestList("ג'ורג' לוי, 0501112222")[0].name).toBe("ג'ורג' לוי");
  });

  it("extracts a foreign number instead of leaving it in the name", () => {
    // Relatives abroad are normal at an Israeli wedding. Their digits used to
    // stay glued into the name, so they were unreachable from Messages.
    const [a] = parseGuestList("Aunt Sarah +1 212 555 1234");
    expect(a.name).toBe("Aunt Sarah");
    expect(a.phone).toBe("12125551234");

    const [b] = parseGuestList("Uncle Dave +44 20 7946 0958");
    expect(b.name).toBe("Uncle Dave");
    expect(b.phone).toBe("442079460958");
  });

  it("still prefers the Israeli form when both could match", () => {
    expect(parseGuestList("דנה, +972-50-123-4567")[0].phone).toBe("0501234567");
  });
});
