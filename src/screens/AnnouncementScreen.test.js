import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { daysUntil } from "../utils/dateFormat.js";

/* THE BUG, on the page every single guest opens.
 *
 * The Save-the-Date / invitation countdown was
 * `Math.ceil((target - now) / 86_400_000)` over a raw duration — the only
 * "days until" in the product that did not go through `daysUntil()`. Measured
 * against that helper as the oracle, 3 of 5 ordinary cases disagreed:
 *
 *   morning before the wedding  → said 2, truth 1
 *   MORNING OF THE WEDDING      → said 1  ← the invitation tells the guests
 *                                            the wedding is tomorrow, on the day
 *   across the 25.10.2026 fall-back → said 3, truth 2
 *
 * Two separate defects wearing one line: `ceil` on a duration overcounts at any
 * hour other than the event's own, and fixed-millisecond arithmetic cannot
 * survive a DST transition. This file pins both, plus the structural fact that
 * the screen no longer does its own date maths.
 */

// Every date bug this project has shipped is invisible at offset zero.
process.env.TZ = "Asia/Jerusalem";

beforeAll(() => {
  const offset = -new Date("2026-09-15T12:00:00").getTimezoneOffset() / 60;
  expect(offset, "the runner is not in Asia/Jerusalem — this file proves nothing").toBeGreaterThan(0);
});

/** The old implementation, kept verbatim as the thing being ruled out. */
const oldCeil = (date, nowMs) => {
  const target = new Date(date + "T18:00:00").getTime();
  const diff = target - nowMs;
  if (diff <= 0) return null;
  return Math.ceil(diff / 86_400_000);
};

const at = (local) => new Date(local);

describe("the countdown a guest reads on the invitation", () => {
  it("does not say 'tomorrow' on the morning of the wedding", () => {
    const now = at("2026-09-15T09:00:00");
    expect(oldCeil("2026-09-15", now.getTime()), "the old behaviour").toBe(1);
    expect(daysUntil("2026-09-15", now)).toBe(0);
  });

  it("says one day on the morning before, not two", () => {
    const now = at("2026-09-14T10:00:00");
    expect(oldCeil("2026-09-14".replace("14", "15"), now.getTime())).toBe(2);
    expect(daysUntil("2026-09-15", now)).toBe(1);
  });

  it("gives the same answer at every hour of the same day", () => {
    // The heart of the `ceil` defect: the number used to depend on the time of
    // day, so a guest opening the invitation at breakfast and again at dinner
    // saw two different countdowns for the same wedding.
    const seen = new Set();
    for (const h of ["00:01", "07:30", "12:00", "17:59", "23:59"]) {
      seen.add(daysUntil("2026-09-15", at(`2026-09-01T${h}:00`)));
    }
    expect([...seen]).toEqual([14]);
  });

  it("survives the DST fall-back on 25.10.2026", () => {
    // Identical shape to a normal week, identical wall-clock anchor. The only
    // difference is the clock change in between, and the old arithmetic added a
    // day for it.
    const now = at("2026-10-24T18:00:00");
    expect(oldCeil("2026-10-26", now.getTime()), "the old behaviour").toBe(3);
    expect(daysUntil("2026-10-26", now)).toBe(2);
  });

  it("survives the spring-forward too", () => {
    const now = at("2026-03-24T18:00:00");
    expect(daysUntil("2026-03-31", now)).toBe(7);
  });
});

describe("the screen no longer does its own date maths", () => {
  const SRC = readFileSync(new URL("./AnnouncementScreen.jsx", import.meta.url), "utf8");

  it("calls daysUntil", () => {
    expect(SRC).toContain("daysUntil(date)");
  });

  it("has no fixed-millisecond day arithmetic left in it", () => {
    // Comments stripped first. The note explaining the fix necessarily QUOTES
    // the arithmetic it replaced, so the raw file matched and this failed on
    // the very edit that fixed the bug — the same trap that caught an earlier
    // source-level check in this repo. Assert on what runs, not what is
    // written about it.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/86[_,]?400[_,]?000/);
    expect(code).not.toContain("Math.ceil");
  });
});
