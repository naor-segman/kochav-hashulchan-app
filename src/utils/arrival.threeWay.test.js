import { describe, it, expect } from "vitest";
import { mergeArrivals, mergeSeatSets } from "./arrival.js";
import { syncBaseOf, arrivalBase } from "./syncBase.js";
import { normalizeEvent } from "./eventHelpers.js";
import { mergeCloudWithLocal } from "../hooks/useEvents.js";

/* ב1/ב8: arrivals merged newest-row-wins lost the other side's seat whenever
 * the host and the greeter both touched the same family, and trusted the
 * host's clock to decide it. With the seat list both last agreed on (kept in
 * syncBase), the merge is the greeter RPC's own rule: (current ∪ added) −
 * removed, from both sides. */

const T = 1_790_000_000_000;
const row = (seats, at) => ({ id: "g1", name: "רון", count: 3, arrivedSeats: seats, arrived: seats.length > 0, arrivedAt: at });
const baseOf = (seats) => arrivalBase(syncBaseOf(normalizeEvent({ id: "e", guests: [row(seats, T)] })));

describe("mergeSeatSets", () => {
  it("keeps both sides' additions and honours both sides' removals", () => {
    expect(mergeSeatSets([0, 1], [0, 2], [0])).toEqual([0, 1, 2]);
    expect(mergeSeatSets([0], [1], [0, 1])).toEqual([]);
    expect(mergeSeatSets([0, 2], [1], [0, 1])).toEqual([2]);
  });
});

describe("mergeArrivals against a base (ב1/ב8)", () => {
  it("ב1: the host's tap and the greeter's tap on one family both survive", () => {
    const greeter = [row([0], T + 1000)];
    const host    = [row([1], T + 5000)];
    expect(mergeArrivals(host, greeter, baseOf([]))[0].arrivedSeats).toEqual([0, 1]);
    // and in the other argument order
    expect(mergeArrivals(greeter, host, baseOf([]))[0].arrivedSeats).toEqual([0, 1]);
  });

  it("ב8: a fast host clock no longer decides — each side's un-mark stands", () => {
    // Both held seats 0 and 1. The host un-marked seat 1 (clock 3 min fast),
    // the greeter later un-marked seat 0 at the door.
    const host    = [row([0], T + 180_000)];
    const greeter = [row([1], T + 60_000)];
    const m = mergeArrivals(host, greeter, baseOf([0, 1]))[0];
    expect(m.arrivedSeats).toEqual([]);
    expect(m.arrived).toBe(false);
  });

  it("without a base the old stamp rule is unchanged", () => {
    const greeter = [row([0], T + 1000)];
    const host    = [row([1], T + 5000)];
    expect(mergeArrivals(host, greeter)[0].arrivedSeats).toEqual([1]);
    // A base written before seats were recorded (no arrivalsBase mark) is "unknown".
    const legacy = syncBaseOf(normalizeEvent({ id: "e", guests: [row([], T)] }));
    delete legacy.arrivalsBase;
    expect(arrivalBase(legacy)).toBe(null);
  });

  it("the base survives normalizeEvent (the localStorage round-trip)", () => {
    const ev = normalizeEvent({ id: "e", guests: [row([0, 2], T)] });
    const stored = normalizeEvent(JSON.parse(JSON.stringify({ ...ev, syncBase: syncBaseOf(ev) })));
    expect(arrivalBase(stored.syncBase)("g1")).toEqual([0, 2]);
    expect(arrivalBase(stored.syncBase)("nobody")).toBe(null);
  });
});

describe("the event merge uses it, whichever side is newer", () => {
  const synced = normalizeEvent({
    id: "e1", cloudId: "c-1", name: "x", type: "חתונה", guests: [row([], T)],
    version: 5, syncedVersion: 5, updatedAt: T, createdAt: T - 1000,
  });
  const base = syncBaseOf(synced);

  it("local newer: the greeter's seat is kept beside the host's", () => {
    const cloud = { ...synced, guests: [row([0], T + 10)], version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...synced, syncBase: base, guests: [row([2], T + 20)], version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.guests[0].arrivedSeats).toEqual([0, 2]);
  });

  it("cloud newer: the host's unpushed seat is kept beside the greeter's, and pushed", () => {
    const cloud = { ...synced, guests: [row([0], T + 30)], version: 6, syncedVersion: 6, updatedAt: T + 30 };
    const local = { ...synced, syncBase: base, guests: [row([2], T + 20)], version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.guests[0].arrivedSeats).toEqual([0, 2]);
    expect(m.version).toBe(7);    // owed to the cloud
  });
});
