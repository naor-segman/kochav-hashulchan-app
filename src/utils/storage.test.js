import { describe, it, expect, beforeEach } from "vitest";
import {
  loadState, persist, userStorageKey,
  clearState, isCloudBacked, pruneCloudBackedEvents,
} from "./storage.js";
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

// What sign-out is allowed to delete from the device. A false positive here
// costs somebody their guest list, so every case is pinned.
describe("isCloudBacked", () => {
  const synced = { id: "a", cloudId: "c-1", version: 3, syncedVersion: 3 };

  it("is true only when a cloud row exists AND nothing changed since the push", () => {
    expect(isCloudBacked(synced)).toBe(true);
  });

  it("is false for an event that never reached the cloud", () => {
    expect(isCloudBacked({ ...synced, cloudId: null })).toBe(false);
    expect(isCloudBacked({ ...synced, cloudId: undefined })).toBe(false);
  });

  it("is false while an edit is still pending (debounced or failed push)", () => {
    expect(isCloudBacked({ ...synced, version: 4 })).toBe(false);
  });

  it("is false for a legacy event with no syncedVersion to compare", () => {
    expect(isCloudBacked({ ...synced, syncedVersion: null })).toBe(false);
    expect(isCloudBacked({ id: "a", cloudId: "c-1", version: 3 })).toBe(false);
  });

  it("treats a missing version as 1 rather than throwing", () => {
    expect(isCloudBacked({ cloudId: "c", syncedVersion: 1 })).toBe(true);
    expect(isCloudBacked({ cloudId: "c", syncedVersion: 2 })).toBe(false);
  });

  it("never throws on junk", () => {
    for (const junk of [null, undefined, {}, 0, "", []]) {
      expect(isCloudBacked(junk)).toBe(false);
    }
  });
});

describe("pruneCloudBackedEvents", () => {
  const key = userStorageKey("A");
  const ev = (id, extra) => ({ id, name: id, version: 1, syncedVersion: null, cloudId: null, ...extra });

  beforeEach(() => localStorage.clear());

  it("removes what the cloud provably holds and keeps everything else", () => {
    persist({ events: [
      ev("pushed",  { cloudId: "c1", version: 2, syncedVersion: 2 }),
      ev("pending", { cloudId: "c2", version: 3, syncedVersion: 2 }),
      ev("draft"),
    ] }, key);

    expect(pruneCloudBackedEvents(key)).toEqual({ removed: 1, kept: 2 });
    expect(loadState(key).events.map(e => e.id)).toEqual(["pending", "draft"]);
  });

  it("removes the bucket outright when nothing survives", () => {
    persist({ events: [ev("a", { cloudId: "c1", version: 1, syncedVersion: 1 }) ] }, key);
    expect(pruneCloudBackedEvents(key)).toEqual({ removed: 1, kept: 0 });
    expect(localStorage.getItem(key)).toBe(null);
  });

  it("leaves an all-unsynced bucket byte-for-byte alone", () => {
    persist({ events: [ev("draft1"), ev("draft2")] }, key);
    const before = localStorage.getItem(key);
    expect(pruneCloudBackedEvents(key)).toEqual({ removed: 0, kept: 2 });
    expect(localStorage.getItem(key)).toBe(before);
  });

  it("preserves sibling keys on the same device — pruning A never touches B", () => {
    persist({ events: [ev("a", { cloudId: "c1", version: 1, syncedVersion: 1 })] }, key);
    persist({ events: [ev("b", { cloudId: "c2", version: 1, syncedVersion: 1 })] }, userStorageKey("B"));
    persist({ events: [ev("g")] }, userStorageKey(null));

    pruneCloudBackedEvents(key);

    expect(loadState(userStorageKey("B")).events.map(e => e.id)).toEqual(["b"]);
    expect(loadState(userStorageKey(null)).events.map(e => e.id)).toEqual(["g"]);
  });

  it("keeps the rest of the state object, not just the events array", () => {
    persist({ activeEventId: "keepme", events: [
      ev("pushed", { cloudId: "c1", version: 1, syncedVersion: 1 }),
      ev("draft"),
    ] }, key);
    pruneCloudBackedEvents(key);
    expect(loadState(key).activeEventId).toBe("keepme");
  });

  it("is a no-op on a bucket that does not exist", () => {
    expect(pruneCloudBackedEvents(userStorageKey("nobody"))).toEqual({ removed: 0, kept: 0 });
  });
});

describe("clearState", () => {
  it("removes only the key it is given", () => {
    persist({ events: [{ id: "a" }] }, userStorageKey("A"));
    persist({ events: [{ id: "b" }] }, userStorageKey("B"));
    expect(clearState(userStorageKey("A"))).toBe(true);
    expect(localStorage.getItem(userStorageKey("A"))).toBe(null);
    expect(loadState(userStorageKey("B")).events).toEqual([{ id: "b" }]);
  });
});
