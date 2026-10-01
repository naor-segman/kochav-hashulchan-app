// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { persist, loadState, floorPlansNotSaved, FLOORPLAN_NOT_SAVED_EVENT } from "./storage.js";

/* 33b: a write over the quota wrote NOTHING — the guest list typed since the
 * last save was lost with the floor-plan image. Now the write is retried
 * without the images (the largest thing in storage, and never synced), the
 * data is kept, and the app is told whose sketch was left out. */
const LIMIT = 2000;
let store;
beforeEach(() => {
  store = new Map();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((k, v) => {
    if (String(v).length > LIMIT) throw new DOMException("full", "QuotaExceededError");
    store.set(k, String(v));
  });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((k) => (store.has(k) ? store.get(k) : null));
});

const big = "data:image/jpeg;base64," + "A".repeat(3000);
const ev = (id, image) => ({ id, name: id, guests: [{ id: "g1", name: "דנה" }], floorPlan: { image, tablePositions: { t1: { x: 0.5, y: 0.5 } }, elements: [] } });

describe("persist over the quota (33b)", () => {
  it("keeps the event data, leaves out only the image, and says so", () => {
    const seen = [];
    const on = (e) => seen.push(e.detail.eventIds);
    window.addEventListener(FLOORPLAN_NOT_SAVED_EVENT, on);
    const quota = vi.fn();
    window.addEventListener("storage-quota-exceeded", quota);

    expect(persist({ events: [ev("E1", big), ev("E2", null)] }, "k")).toBe(true);
    const stored = loadState("k").events;
    expect(stored.map(e => e.id)).toEqual(["E1", "E2"]);
    expect(stored[0].guests[0].name).toBe("דנה");
    expect(stored[0].floorPlan.image).toBe(null);
    expect(stored[0].floorPlan.tablePositions.t1).toEqual({ x: 0.5, y: 0.5 });
    expect(seen).toEqual([["E1"]]);
    expect([...floorPlansNotSaved()]).toEqual(["E1"]);
    expect(quota).not.toHaveBeenCalled();     // the data WAS saved

    window.removeEventListener(FLOORPLAN_NOT_SAVED_EVENT, on);
    window.removeEventListener("storage-quota-exceeded", quota);
  });

  it("a later write that fits clears the flag", () => {
    persist({ events: [ev("E1", big)] }, "k");
    persist({ events: [ev("E1", null)] }, "k");
    expect(floorPlansNotSaved().size).toBe(0);
  });

  it("still reports the quota when even the lean copy does not fit", () => {
    const quota = vi.fn();
    window.addEventListener("storage-quota-exceeded", quota);
    const huge = { events: [{ ...ev("E1", big), notes: "x".repeat(LIMIT) }] };
    expect(persist(huge, "k2")).toBe(false);
    expect(quota).toHaveBeenCalledTimes(1);
    window.removeEventListener("storage-quota-exceeded", quota);
  });
});
