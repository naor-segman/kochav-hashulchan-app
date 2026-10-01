import { describe, it, expect } from "vitest";

/* fmtDateTime — a server TIMESTAMP in the host's own time zone.
 *
 * In its own file because it has to run in Israel's time zone: bug class 2 is
 * invisible at offset zero, and this container runs UTC. Setting TZ before the
 * module is used makes Node re-read the zone; the guard below proves it took,
 * the same way photoRetention.test.js does, so a runner that ignores TZ fails
 * loudly instead of passing a test that measured nothing. */
process.env.TZ = "Asia/Jerusalem";
const { fmtDate, fmtDateTime, fmtShortDate } = await import("./dateFormat.js");

describe("fmtDateTime", () => {
  it("the zone really is Israel (or every assertion below is meaningless)", () => {
    // 2026-09-27 22:30 UTC is 01:30 on the 28th in Israel (IDT, UTC+3).
    expect(new Date("2026-09-27T22:30:00Z").getDate()).toBe(28);
  });

  it("a photo uploaded at 01:30 Israel time shows TODAY's date, not yesterday's", () => {
    // The shape of bug class 2: cut the timestamp to its first ten characters
    // and this reads 27 — the UTC date, a day early.
    const out = fmtDateTime("2026-09-27T22:30:00Z");
    expect(out).toMatch(/28/);
    expect(out).not.toMatch(/27/);
    expect(out).toMatch(/01:30/);
  });

  it("is what fmtDate is NOT for — fmtDate hands a timestamp back raw", () => {
    // Why this function exists. The host album's first draft called fmtDate on
    // a timestamp and printed the ISO string under every photo.
    expect(fmtDate("2026-09-27T22:30:00Z")).toBe("2026-09-27T22:30:00Z");
    expect(fmtDateTime("2026-09-27T22:30:00Z")).not.toMatch(/T|Z/);
  });

  it("never renders the epoch or 'Invalid Date' for missing input", () => {
    // new Date(null) is 1 January 1970 and does not throw.
    for (const bad of [null, undefined, "", "not a date"]) {
      expect(fmtDateTime(bad), String(bad)).toBe("");
    }
  });
});

describe("fmtShortDate — the account screen's purchase dates (107)", () => {
  it("prints the LOCAL date of a timestamp", () => {
    // 22:30 UTC on the 27th is already the 28th in Jerusalem.
    expect(fmtShortDate("2026-09-27T22:30:00Z")).toBe("28.09.2026");
  });
  it("prints nothing — not 'Invalid Date', not the epoch — for a non-date", () => {
    for (const bad of [null, undefined, "", "nonsense"]) expect(fmtShortDate(bad)).toBeNull();
  });
});

describe("no screen keeps its own date formatter (107)", () => {
  it("screens import from utils/dateFormat.js", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const own = readdirSync("src/screens").filter(f => f.endsWith(".jsx") && !f.includes(".test."))
      .filter(f => /function\s+formatDate\s*\(/.test(readFileSync(`src/screens/${f}`, "utf8")));
    expect(own).toEqual([]);
  });
});
