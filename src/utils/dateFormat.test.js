import { describe, it, expect } from "vitest";
import { fmtDate } from "./dateFormat.js";

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
