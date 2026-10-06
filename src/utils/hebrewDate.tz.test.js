import { describe, it, expect } from "vitest";

/* Bug class 2 (dates shifted a day) is invisible at offset zero, and the suite
 * runs in the machine's zone — UTC here. The review (6.10) put the forbidden
 * `new Date(iso)` into a copy of hebrewDate.js and every test in
 * hebrewDate.test.js still passed under UTC. Run WEST of Greenwich, where a
 * UTC-midnight parse lands on the previous evening. */
process.env.TZ = "America/New_York";
const { hebrewCalendarDate } = await import("./hebrewDate.js");

describe("hebrewCalendarDate west of Greenwich", () => {
  it("the premise: this process is not at offset zero", () => {
    expect(new Date("2026-10-06").getDate()).toBe(5);   // a UTC parse is the 5th here
  });
  it("is the civil day the host typed, not the day before", () => {
    expect(hebrewCalendarDate("2026-10-06")).toBe("כ״ה בתשרי תשפ״ז");
    expect(hebrewCalendarDate("2026-09-12")).toBe("א׳ בתשרי תשפ״ז");   // Rosh Hashana, not the eve
    expect(hebrewCalendarDate("2027-03-10")).toBe("א׳ באדר ב׳ תשפ״ז");
  });
});
