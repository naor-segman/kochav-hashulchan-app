import { describe, it, expect } from "vitest";
import { parseGuestList } from "./parseGuestList.js";

/* 91: two phones for one guest. In a spreadsheet cell both numbers were lost
 * (the cell was not a whole-cell phone, so it read as "a stray number column");
 * typed on one line the second was dropped without a trace. The first is the
 * guest's phone; the others are kept in the notes. */
describe("two phones for one guest (91)", () => {
  it("one spreadsheet cell holding two numbers keeps both", () => {
    expect(parseGuestList("דנה כהן\t050-1234567, 052-7654321\t2")).toEqual([
      { name: "דנה כהן", phone: "0501234567", count: 2, companions: [], notes: "טלפון נוסף: 0527654321" },
    ]);
    expect(parseGuestList("דנה כהן\t0501234567 / 0527654321")).toEqual([
      { name: "דנה כהן", phone: "0501234567", notes: "טלפון נוסף: 0527654321" },
    ]);
  });

  it("a typed line with two numbers keeps both, and three", () => {
    expect(parseGuestList("דנה כהן 050-1234567, 052-7654321")).toEqual([
      { name: "דנה כהן", phone: "0501234567", notes: "טלפון נוסף: 0527654321" },
    ]);
    expect(parseGuestList("דנה כהן 0501234567 0527654321 0541112222")).toEqual([
      { name: "דנה כהן", phone: "0501234567", notes: "טלפונים נוספים: 0527654321, 0541112222" },
    ]);
  });

  it("two people with a number each are still two guests, with no notes", () => {
    expect(parseGuestList("דוד לוי 0501234567 שרה כהן 0521234567")).toEqual([
      { name: "דוד לוי", phone: "0501234567" },
      { name: "שרה כהן", phone: "0521234567" },
    ]);
  });

  it("a cell with a number and words is not read as phones", () => {
    const [r] = parseGuestList("דנה כהן\t0501234567\tבית 0527654321");
    expect(r.phone).toBe("0501234567");
    expect(r.notes).toBeUndefined();
  });
});
