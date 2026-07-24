import { describe, it, expect, beforeEach } from "vitest";
import { loadState, persist, userStorageKey } from "./storage.js";
import { STORAGE_KEY } from "../data/constants.js";

// Minimal in-memory localStorage shim (the test env has no DOM).
beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
});

describe("userStorageKey", () => {
  it("returns the base key for guests (no user)", () => {
    expect(userStorageKey(null)).toBe(STORAGE_KEY);
    expect(userStorageKey(undefined)).toBe(STORAGE_KEY);
  });

  it("returns a distinct, per-user key when logged in", () => {
    const a = userStorageKey("user-a");
    const b = userStorageKey("user-b");
    expect(a).toBe(`${STORAGE_KEY}::u_user-a`);
    expect(a).not.toBe(b);            // no two users share a bucket
    expect(a).not.toBe(STORAGE_KEY);  // never the guest bucket
  });
});

describe("loadState / persist with explicit keys", () => {
  beforeEach(() => localStorage.clear());

  it("keeps each key's data isolated", () => {
    persist({ events: [{ id: "a" }] }, userStorageKey("A"));
    persist({ events: [{ id: "b" }] }, userStorageKey("B"));
    persist({ events: [{ id: "g" }] }); // guest / default key

    expect(loadState(userStorageKey("A")).events).toEqual([{ id: "a" }]);
    expect(loadState(userStorageKey("B")).events).toEqual([{ id: "b" }]);
    expect(loadState().events).toEqual([{ id: "g" }]);
  });

  it("returns { events: [] } for an unknown key", () => {
    expect(loadState(userStorageKey("nobody"))).toEqual({ events: [] });
  });
});
