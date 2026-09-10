import { describe, it, expect } from "vitest";
import { attachWindowMeta } from "./listWindow.js";

// The admin lists load a capped window. Before this, AdminEventsScreen printed
// `{filtered.length} מתוך {events.length}` — both sides of that comparison came
// out of the same truncated array, so on a table of 1,240 events it read
// "500 אירועים" and stopped. Not a rounding error: a wrong answer to the only
// question the screen is asked.
//
// A notice like this is only worth having if it is right in BOTH directions —
// it must fire when rows are hidden, and it must stay silent when they are not.
// A panel that cries truncation on a complete list stops being read.

const win = (n, limit, count) =>
  attachWindowMeta(Array.from({ length: n }, (_, i) => ({ i })), limit, count);

describe("a window onto a bigger table", () => {
  it("reports the true total, not the window", () => {
    const rows = win(500, 500, 1240);
    expect(rows.total).toBe(1240);
    expect(rows.truncated).toBe(true);
  });

  it("says nothing when the window holds everything", () => {
    const rows = win(8, 500, 8);
    expect(rows.total).toBe(8);
    expect(rows.truncated).toBe(false);
  });

  it("does not claim truncation at EXACTLY the limit", () => {
    // The edge the shared helper exists for. `rows.length >= limit` — the test
    // AdminUsersScreen still uses — calls a complete 500-row table a window and
    // tells the operator rows are hidden when none are.
    const rows = win(500, 500, 500);
    expect(rows.total).toBe(500);
    expect(rows.truncated).toBe(false);
  });

  it("fires at one row past the limit", () => {
    expect(win(500, 500, 501).truncated).toBe(true);
  });

  it("handles an empty table without inventing anything", () => {
    const rows = win(0, 500, 0);
    expect(rows.total).toBe(0);
    expect(rows.truncated).toBe(false);
  });

  it("leaves the rows themselves alone", () => {
    const rows = win(3, 500, 3);
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({ i: 0 });
  });
});

describe("when the count query gives us nothing", () => {
  // PostgREST returns count: null when the head-select errors, and the field is
  // simply absent if no count query was made at all. Both must degrade to the
  // imprecise-but-safe test rather than to a confident wrong total.

  it("falls back to the window length as the total", () => {
    for (const bad of [null, undefined, NaN, "1240"]) {
      const rows = win(500, 500, bad);
      expect(rows.total, `count=${String(bad)}`).toBe(500);
      expect(rows.truncated, `count=${String(bad)}`).toBe(true);
    }
  });

  it("stays silent on a short window with no count", () => {
    expect(win(8, 500, null).truncated).toBe(false);
    expect(win(8, 500, null).total).toBe(8);
  });

  it("does not let null coerce its way into a comparison", () => {
    // `null >= 0` is true and `null > 0` is false — a count of null read as a
    // number would make a 1,240-row table report a total of 0 and truncated
    // false, i.e. the exact bug being fixed, silently reintroduced.
    const rows = win(500, 500, null);
    expect(rows.total).not.toBe(0);
    expect(rows.truncated).toBe(true);
  });

  it("treats a real zero as a real zero, not as missing", () => {
    // The mirror of the case above: 0 is falsy, so `count ?? rows.length` is
    // right but `count || rows.length` would not be.
    expect(win(0, 500, 0).total).toBe(0);
  });
});
