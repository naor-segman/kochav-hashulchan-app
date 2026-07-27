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
