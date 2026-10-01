import { describe, it, expect } from "vitest";
import { metaSummary } from "./activityConfig.js";

// WORKPLAN 114 (1.10): the cell showed three fields and dropped the rest silently.
describe("metaSummary", () => {
  it("past three fields, says how many more", () => {
    expect(metaSummary({ a: 1, b: 2, c: 3, d: 4, e: 5 })).toMatch(/ · ועוד 2$/);
  });
  it("three or fewer: no count", () => {
    expect(metaSummary({ a: 1, b: 2 })).not.toMatch(/ועוד/);
    expect(metaSummary({})).toBe("—");
  });
});
