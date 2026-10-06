import { describe, it, expect } from "vitest";
import { toastDuration } from "./useToast.js";

// Review 6.10: the seating run's explanation (~150 characters) closed after
// the flat 3.2s every toast had — before it could be read.
describe("toastDuration", () => {
  it("keeps 3.2s for a short message", () => {
    expect(toastDuration("נשמר ✓")).toBe(3200);
  });
  it("gives a long message time to be read, up to 9s", () => {
    expect(toastDuration("א".repeat(100))).toBe(6000);
    expect(toastDuration("א".repeat(400))).toBe(9000);
  });
});
