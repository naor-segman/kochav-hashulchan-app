import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { israelInstant } from "./calendarFile.js";

// The countdown on the event site ends at the event's start IN ISRAEL. It read
// the date and time in the VIEWER's zone, so a guest abroad watched it end
// hours off (29.9 review). Run as a guest in New York — at Israel's own offset
// the old line and the new one agree, and the test would prove nothing.
let saved;
beforeAll(() => { saved = process.env.TZ; process.env.TZ = "America/New_York"; });
afterAll(() => { process.env.TZ = saved; });

describe("israelInstant — the start, in Israel time, from any device", () => {
  it("a 21:00 wedding in summer time (UTC+3)", () => {
    expect(new Date(israelInstant("2026-10-01", "21:00")).toISOString()).toBe("2026-10-01T18:00:00.000Z");
  });
  it("and in winter time (UTC+2)", () => {
    expect(new Date(israelInstant("2027-01-15", "19:00")).toISOString()).toBe("2027-01-15T17:00:00.000Z");
  });
  it("the premise: the old reading, in New York, is seven hours off", () => {
    expect(new Date("2026-10-01T21:00:00").toISOString()).toBe("2026-10-02T01:00:00.000Z");
  });
  it("malformed parts give NaN, not a date", () => {
    expect(israelInstant("2026-10-01", "9pm")).toBeNaN();
    expect(israelInstant("", "21:00")).toBeNaN();
  });
});
