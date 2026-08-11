import { describe, it, expect } from "vitest";
import { nextTableNames } from "./tableNames.js";

const tbl = (...names) => names.map(name => ({ id: name, name }));

describe("nextTableNames", () => {
  it("numbers from one on an empty event", () => {
    expect(nextTableNames([], 3)).toEqual(["שולחן 1", "שולחן 2", "שולחן 3"]);
  });

  it("continues after the highest number in use, not after the table count", () => {
    // The bug this exists for: 14 tables, "שולחן 5" deleted → 13 tables, and a
    // count-based name would be "שולחן 14", which is already on the floor.
    const existing = tbl(...Array.from({ length: 14 }, (_, i) => "שולחן " + (i + 1))
      .filter(n => n !== "שולחן 5"));
    expect(existing).toHaveLength(13);
    expect(nextTableNames(existing, 3)).toEqual(["שולחן 15", "שולחן 16", "שולחן 17"]);
  });

  it("never returns a name the event already has", () => {
    const existing = tbl("שולחן 1", "שולחן 2", "שולחן 20");
    const names = nextTableNames(existing, 5);
    for (const n of names) expect(existing.map(t => t.name)).not.toContain(n);
  });

  it("never repeats a name within one batch", () => {
    const names = nextTableNames(tbl("שולחן 3"), 40);
    expect(new Set(names).size).toBe(40);
  });

  it("skips a number a hand-renamed table has taken above the run", () => {
    // "שולחן 9" was typed by hand onto a table that is not numbered 9 in order;
    // the sequence has to step over it rather than mint a duplicate.
    const names = nextTableNames(tbl("שולחן 1", "שולחן 2", "שולחן 9"), 2);
    expect(names).toEqual(["שולחן 10", "שולחן 11"]);
  });

  it("ignores names that are not this prefix plus a number", () => {
    const existing = tbl("שולחן החתן והכלה", "ראשי", "שולחן 2", "12");
    expect(nextTableNames(existing, 1)).toEqual(["שולחן 3"]);
  });

  it("compares names trimmed, the way the rename guard does", () => {
    expect(nextTableNames(tbl("  שולחן 4  "), 1)).toEqual(["שולחן 5"]);
  });

  it("tolerates a table with no name at all", () => {
    expect(nextTableNames([{ id: "a" }, { id: "b", name: null }, ...tbl("שולחן 1")], 1))
      .toEqual(["שולחן 2"]);
  });

  it("returns nothing for a count of zero or nonsense", () => {
    expect(nextTableNames(tbl("שולחן 1"), 0)).toEqual([]);
    expect(nextTableNames(tbl("שולחן 1"), -3)).toEqual([]);
    expect(nextTableNames(tbl("שולחן 1"), undefined)).toEqual([]);
    expect(nextTableNames(tbl("שולחן 1"), NaN)).toEqual([]);
  });

  it("survives a missing or non-array table list", () => {
    expect(nextTableNames(undefined, 2)).toEqual(["שולחן 1", "שולחן 2"]);
    expect(nextTableNames(null, 1)).toEqual(["שולחן 1"]);
  });

  it("treats a custom prefix as text, not as a pattern", () => {
    // "(VIP)" is a legal table name and a very illegal regex. Escaped, it
    // matches literally; unescaped, the group would swallow the numbering.
    const existing = tbl("שולחן (VIP) 2");
    expect(nextTableNames(existing, 2, "שולחן (VIP)"))
      .toEqual(["שולחן (VIP) 3", "שולחן (VIP) 4"]);
  });

  it("does not collide with a bare prefix used as a whole name", () => {
    expect(nextTableNames(tbl("שולחן"), 1)).toEqual(["שולחן 1"]);
  });
});
