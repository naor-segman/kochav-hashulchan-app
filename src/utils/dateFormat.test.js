import { describe, it, expect } from "vitest";
import { fmtDate, daysUntil } from "./dateFormat.js";

describe("fmtDate", () => {
  it("formats a valid ISO date in Hebrew", () => {
    expect(fmtDate("2026-09-15")).toBe("15 בספטמבר 2026");
    expect(fmtDate("2026-01-01")).toBe("1 בינואר 2026");
  });

  it("returns null for empty/nullish input", () => {
    expect(fmtDate("")).toBeNull();
    expect(fmtDate(null)).toBeNull();
    expect(fmtDate(undefined)).toBeNull();
  });

  it("returns the raw string on malformed input (no 'NaN בundefined')", () => {
    expect(fmtDate("2026-07")).toBe("2026-07");   // missing day
    expect(fmtDate("2026")).toBe("2026");         // year only
    expect(fmtDate("garbage")).toBe("garbage");
  });
});

describe("daysUntil", () => {
  it("counts calendar days, not elapsed milliseconds", () => {
    expect(daysUntil("2026-08-10", new Date(2026, 6, 29))).toBe(12);
    expect(daysUntil("2026-07-29", new Date(2026, 6, 29))).toBe(0);
    expect(daysUntil("2026-07-28", new Date(2026, 6, 29))).toBe(-1);
  });

  it("survives a DST transition — the bug the ms version has", () => {
    // Israel moves the clock back on the last Sunday of October. A span that
    // crosses it is 24h + 1h of wall clock, so `diff / 86400000` rounds wrong.
    expect(daysUntil("2026-11-01", new Date(2026, 9, 24))).toBe(8);
    expect(daysUntil("2026-10-30", new Date(2026, 9, 20))).toBe(10);
  });

  it("returns null rather than NaN for junk", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil("")).toBeNull();
    expect(daysUntil("לא תאריך")).toBeNull();
    expect(daysUntil("2026-13")).toBeNull();
  });
});
