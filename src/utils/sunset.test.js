import { describe, it, expect } from "vitest";
import { israelSunsetMs } from "./sunset.js";

// Published sunset times for Tel Aviv (Israel local), to within a few minutes:
// the algorithm is good to about a minute, the location is one fixed point.
const local = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
const mins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

describe("israelSunsetMs", () => {
  it.each([
    ["2026-06-21", "19:49"],   // summer solstice, IDT
    ["2026-12-21", "16:39"],   // winter solstice, IST
    ["2026-03-20", "17:51"],   // equinox, before the clocks change (27.3)
    ["2026-09-23", "18:36"],   // equinox, IDT
  ])("%s ≈ %s", (iso, want) => {
    expect(Math.abs(mins(local(israelSunsetMs(iso))) - mins(want))).toBeLessThanOrEqual(3);
  });
  it("NaN for what is not a date", () => {
    expect(israelSunsetMs("")).toBeNaN();
    expect(israelSunsetMs("2026-02-31")).toBeNaN();
  });
});
