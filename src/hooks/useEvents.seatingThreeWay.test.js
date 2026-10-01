import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";
import { syncBaseOf } from "../utils/syncBase.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* ב2: the seating map (and the table rows) came whole from whichever side won
 * on updatedAt. A guest the phone seated was unseated again by a stale laptop
 * that renamed the venue later — and pushed. Now per guest (and per table
 * field) against the copy both last agreed on, like the guest fields. */
const T = 1_790_000_000_000;
const synced = normalizeEvent({
  id: "e1", cloudId: "c-1", name: "x", type: "חתונה", venue: "v0",
  guests: [{ id: "g1", name: "רון" }, { id: "g2", name: "דנה" }, { id: "g3", name: "טל" }],
  tables: [{ id: "t1", name: "שולחן 1", capacity: 10 }, { id: "t2", name: "שולחן 2", capacity: 10 }],
  seating: { g3: "t2" },
  version: 5, syncedVersion: 5, updatedAt: T, createdAt: T - 1000,
});
const base = syncBaseOf(synced);
const cloudV6 = (over) => ({ ...synced, ...over, version: 6, syncedVersion: 6 });
const localEdit = (over) => ({ ...synced, syncBase: base, version: 6, syncedVersion: 5, ...over });

describe("seating merges per guest against the base (ב2)", () => {
  it("local newer: a seat only the other device set survives", () => {
    const cloud = cloudV6({ seating: { g1: "t1", g3: "t2" }, updatedAt: T + 10 });
    const local = localEdit({ venue: "v-A", updatedAt: T + 20 });
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.seating).toEqual({ g1: "t1", g3: "t2" });
    expect(m.venue).toBe("v-A");
  });

  it("local newer: an unseating only the other device did survives", () => {
    const cloud = cloudV6({ seating: {}, updatedAt: T + 10 });
    const local = localEdit({ venue: "v-A", updatedAt: T + 20 });
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.seating).toEqual({});
  });

  it("cloud newer: this device's unpushed seat survives beside the cloud's, and is pushed", () => {
    const cloud = cloudV6({ seating: { g1: "t1", g3: "t2" }, updatedAt: T + 30 });
    const local = localEdit({ seating: { g2: "t2", g3: "t1" }, updatedAt: T + 20 });
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.seating).toEqual({ g1: "t1", g2: "t2", g3: "t1" });
    expect(m.version).toBe(7);
  });

  it("both moved the same guest: the newer side still wins", () => {
    const cloud = cloudV6({ seating: { g3: "t1" }, updatedAt: T + 10 });
    const local = localEdit({ seating: {}, updatedAt: T + 20 });
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.seating).toEqual({});
  });

  it("without a seating base (older syncBase) the old rule is unchanged", () => {
    const old = { ...base }; delete old.seatingBase;
    const cloud = cloudV6({ seating: { g1: "t1", g3: "t2" }, updatedAt: T + 10 });
    const local = localEdit({ syncBase: old, venue: "v-A", updatedAt: T + 20 });
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.seating).toEqual({ g3: "t2" });
  });
});

describe("table rows merge per field (ב2)", () => {
  it("local newer: a capacity the other device changed survives", () => {
    const cloud = cloudV6({ tables: [{ ...synced.tables[0], capacity: 14 }, synced.tables[1]], updatedAt: T + 10 });
    const local = localEdit({ tables: [synced.tables[0], { ...synced.tables[1], name: "VIP" }], updatedAt: T + 20 });
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.tables.map(t => [t.capacity, t.name])).toEqual([[14, "שולחן 1"], [10, "VIP"]]);
  });

  it("cloud newer: this device's table rename survives, and is pushed", () => {
    const cloud = cloudV6({ tables: [{ ...synced.tables[0], capacity: 14 }, synced.tables[1]], updatedAt: T + 30 });
    const local = localEdit({ tables: [synced.tables[0], { ...synced.tables[1], name: "VIP" }], updatedAt: T + 20 });
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.tables.map(t => [t.capacity, t.name])).toEqual([[14, "שולחן 1"], [10, "VIP"]]);
    expect(m.version).toBe(7);
  });

  it("the table base survives the localStorage round-trip", () => {
    const stored = normalizeEvent(JSON.parse(JSON.stringify({ ...synced, syncBase: base })));
    expect(stored.syncBase.tables).toEqual(base.tables);
    expect(stored.syncBase.seatingBase).toBe("1");
  });
});
