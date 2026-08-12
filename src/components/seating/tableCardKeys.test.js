import { describe, it, expect } from "vitest";
import { tableCardKeys } from "./tableCardKeys.js";

const ids = n => Array.from({ length: n }, (_, i) => ({ id: "t" + (i + 1) }));

describe("tableCardKeys", () => {
  it("is the id itself when the ids are already unique — the normal case", () => {
    expect(tableCardKeys(ids(3))).toEqual(["t1", "t2", "t3"]);
  });

  it("keeps one key per table, in table order, whatever the data", () => {
    const tables = [{ id: "t1" }, { id: "t1" }, { id: "t2" }, {}, { id: null }];
    const keys = tableCardKeys(tables);
    expect(keys).toHaveLength(tables.length);
    expect(new Set(keys).size).toBe(tables.length);
    expect(keys[0]).toBe("t1");
    expect(keys[2]).toBe("t2");
  });

  it("gives the SECOND table with a shared id its own key", () => {
    // This is the whole point: expandedIds.has(key) must be able to be true for
    // one of the two cards and false for the other.
    const [a, b] = tableCardKeys([{ id: "t1" }, { id: "t1" }]);
    expect(a).not.toBe(b);
  });

  it("survives a third and fourth copy of the same id", () => {
    const keys = tableCardKeys([{ id: "x" }, { id: "x" }, { id: "x" }, { id: "x" }]);
    expect(new Set(keys).size).toBe(4);
  });

  it("does not collide when a real id looks like the suffix it would generate", () => {
    // "t1#dup2" is a legal id in stored data — a hand-edited file, an import.
    const keys = tableCardKeys([{ id: "t1" }, { id: "t1#dup2" }, { id: "t1" }]);
    expect(new Set(keys).size).toBe(3);
    expect(keys[1]).toBe("t1#dup2");
  });

  it("handles a numeric id without turning two of them into one", () => {
    const keys = tableCardKeys([{ id: 1 }, { id: "1" }, { id: 2 }]);
    expect(new Set(keys).size).toBe(3);
  });

  it("returns an empty array for anything that is not a list of tables", () => {
    expect(tableCardKeys([])).toEqual([]);
    expect(tableCardKeys(null)).toEqual([]);
    expect(tableCardKeys(undefined)).toEqual([]);
    expect(tableCardKeys("t1,t2")).toEqual([]);
  });
});
