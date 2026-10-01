// The merge's arrangement integrity (29.9 review). Every scenario here was
// written by the reviewer against the code BEFORE the fix; R1–R5 (six tests)
// failed there, R7–R9 already held and stay as guards: a seat, a lock or a floor-plan position pointing at a guest or
// table that no longer exists — invisible in every unassigned list, counted as
// seated — or the other device's floor plan thrown away because this device
// had never opened it.
//
// Not here, on purpose: the other device seating guests BOTH devices know,
// while this device's older copy wins on an unrelated edit. That seating is
// lost — inherent to whole-event newest-wins without per-field timestamps,
// and recorded as such in WORKPLAN 107.
import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";

const NOW = Date.now();
const ev = (over = {}) => ({
  id: "e1", name: "x", type: "חתונה", cloudId: "c1",
  guests: [], tables: [], seating: {}, constraints: [],
  createdAt: 1000, updatedAt: 1000, version: 5, ...over,
});
const orphans = (out) => ({
  seatToMissingTable: Object.entries(out.seating).filter(([, t]) => !out.tables.some(x => x.id === t)),
  seatForMissingGuest: Object.keys(out.seating).filter(g => !out.guests.some(x => x.id === g)),
  lockGuestMissing: out.lockedGuests.filter(g => !out.guests.some(x => x.id === g)),
  lockTableMissing: out.lockedTables.filter(t => !out.tables.some(x => x.id === t)),
  posMissing: Object.keys(out.floorPlan?.tablePositions || {}).filter(t => !out.tables.some(x => x.id === t)),
});

describe("R1 local wins — other device DELETED a table this device seated someone at", () => {
  it("seating must not point at the deleted table", () => {
    // Laptop (local, newer) still has t2 with g1 at it. Phone deleted t2 (tombstone) and pushed.
    const local = [ev({ updatedAt: 9000, guests: [{ id: "g1" }], tables: [{ id: "t1" }, { id: "t2" }],
      seating: { g1: "t2" }, lockedTables: ["t2"],
      floorPlan: { image: "x", tablePositions: { t1: { x: 1 }, t2: { x: 2 } } } })];
    const cloud = [ev({ updatedAt: 5000, guests: [{ id: "g1" }], tables: [{ id: "t1" }], seating: {},
      deletedRows: { tables: { t2: NOW } }, floorPlan: { image: null, tablePositions: { t1: { x: 1 } } } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tables.map(t => t.id)).toEqual(["t1"]);
    expect(orphans(out).seatToMissingTable).toEqual([]);
  });
});

describe("R2 local wins — other device deleted a guest this device seated/locked", () => {
  it("no seat or lock for the deleted guest", () => {
    const local = [ev({ updatedAt: 9000, guests: [{ id: "g1" }, { id: "g2" }], tables: [{ id: "t1" }],
      seating: { g1: "t1", g2: "t1" }, lockedGuests: ["g2"] })];
    const cloud = [ev({ updatedAt: 5000, guests: [{ id: "g1" }], tables: [{ id: "t1" }], seating: { g1: "t1" },
      deletedRows: { guests: { g2: NOW } } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests.map(g => g.id)).toEqual(["g1"]);
    expect(orphans(out).lockGuestMissing).toEqual([]);
    expect(orphans(out).seatForMissingGuest).toEqual([]);
  });
});

describe("R3 cloud wins — THIS device deleted a table the cloud still has someone at", () => {
  it("seating must not point at the table this device deleted", () => {
    const local = [ev({ updatedAt: 1000, guests: [{ id: "g1" }], tables: [{ id: "t1" }], seating: {},
      deletedRows: { tables: { t2: NOW } } })];
    const cloud = [ev({ updatedAt: 9000, guests: [{ id: "g1" }], tables: [{ id: "t1" }, { id: "t2" }],
      seating: { g1: "t2" }, lockedTables: ["t2"], floorPlan: { image: null, tablePositions: { t2: { x: 2 } } } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tables.map(t => t.id)).toEqual(["t1"]);
    expect(orphans(out).lockTableMissing).toEqual([]);
    expect(orphans(out).seatToMissingTable).toEqual([]);
  });
});

describe("R4 cloud wins — 'remove from sketch' on the other device undone by stale local", () => {
  it("does not bring back a position the cloud removed for a table it knows", () => {
    const local = [ev({ updatedAt: 1000, tables: [{ id: "t1" }],
      floorPlan: { image: "img", tablePositions: { t1: { x: 1 } } } })];
    const cloud = [ev({ updatedAt: 9000, tables: [{ id: "t1" }],
      floorPlan: { image: null, tablePositions: {} } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.floorPlan.tablePositions.t1).toBeUndefined();
  });
  it("does not keep a position for a table this device's copy has but the cloud deleted", () => {
    const local = [ev({ updatedAt: 1000, tables: [{ id: "t1" }, { id: "t2" }],
      floorPlan: { image: "img", tablePositions: { t1: { x: 1 }, t2: { x: 2 } } } })];
    const cloud = [ev({ updatedAt: 9000, tables: [{ id: "t1" }], deletedRows: { tables: { t2: NOW } },
      floorPlan: { image: null, tablePositions: { t1: { x: 1 } } } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(orphans(out).posMissing).toEqual([]);
  });
});

describe("R5 local wins with NO local floor plan — other device's new table position", () => {
  it("keeps the position of a table only the other device knew", () => {
    const local = [ev({ updatedAt: 9000, tables: [{ id: "t1" }], floorPlan: null })];
    const cloud = [ev({ updatedAt: 5000, tables: [{ id: "t1" }, { id: "t2" }],
      floorPlan: { image: null, tablePositions: { t1: { x: 1 }, t2: { x: 2 } }, elements: [{ id: "el1", kind: "stage" }] } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.floorPlan?.tablePositions?.t2).toEqual({ x: 2 });
  });
});

describe("R7 resurrection — both sides", () => {
  it("guest deleted locally (tombstoned) is not resurrected by cloud copy, either branch", () => {
    for (const [lu, cu] of [[9000, 5000], [1000, 9000]]) {
      const local = [ev({ updatedAt: lu, guests: [{ id: "g1" }], deletedRows: { guests: { g2: NOW } } })];
      const cloud = [ev({ updatedAt: cu, guests: [{ id: "g1" }, { id: "g2" }], seating: { g2: "t1" }, tables: [{ id: "t1" }] })];
      const [out] = mergeCloudWithLocal(local, cloud);
      expect(out.guests.map(g => g.id)).toEqual(["g1"]);
    }
  });
});

describe("R8 local wins — guest moved on both devices", () => {
  it("winner's move wins", () => {
    const base = { guests: [{ id: "g1" }], tables: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] };
    const [out] = mergeCloudWithLocal([ev({ ...base, updatedAt: 9000, seating: { g1: "t3" } })],
                                      [ev({ ...base, updatedAt: 5000, seating: { g1: "t2" } })]);
    expect(out.seating).toEqual({ g1: "t3" });
    const [out2] = mergeCloudWithLocal([ev({ ...base, updatedAt: 1000, seating: { g1: "t3" } })],
                                       [ev({ ...base, updatedAt: 9000, seating: { g1: "t2" } })]);
    expect(out2.seating).toEqual({ g1: "t2" });
  });
});

describe("R9 local wins — cloud-only guest seated at a table the local side deleted", () => {
  it("does not seat the new guest at a tombstoned table", () => {
    const local = [ev({ updatedAt: 9000, guests: [{ id: "g1" }], tables: [{ id: "t1" }], deletedRows: { tables: { t2: NOW } } })];
    const cloud = [ev({ updatedAt: 5000, guests: [{ id: "g1" }, { id: "g2" }], tables: [{ id: "t1" }, { id: "t2" }],
      seating: { g2: "t2" }, lockedGuests: ["g2"], lockedTables: ["t2"] })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.seating.g2).toBeUndefined();
    expect(out.lockedTables).not.toContain("t2");
  });
});


// ── Link revocation is per link (29.9 review) ────────────────────────────────
import { rotateEventToken, normalizeEvent } from "../utils/eventHelpers.js";
import { mapLocalEventToCloudPayload, mapCloudEventToLocalEvent } from "../utils/cloudSync.js";

describe("R11 rotating one link does not bring back another link revoked elsewhere", () => {
  it("laptop revokes the family link at 18:00; a phone holding a 17:00 copy rotates the door link at 20:00", () => {
    const at17 = normalizeEvent(ev({ updatedAt: 17, tokens: { collab: "collab-OLD", hostess: "door-OLD" } }));
    const laptop = rotateEventToken(at17, "collab", 18);          // revoked — pushed to the cloud
    const phone  = rotateEventToken(at17, "hostess", 20);         // stale copy, later rotation
    const cloudRow = { ...mapLocalEventToCloudPayload({ ...laptop, updatedAt: 18 }, "u1"), id: "c1" };
    const [out] = mergeCloudWithLocal([{ ...phone, updatedAt: 20 }], [mapCloudEventToLocalEvent(cloudRow)]);
    expect(out.tokens.collab).toBe(laptop.tokens.collab);        // stays revoked
    expect(out.tokens.collab).not.toBe("collab-OLD");
    expect(out.tokens.hostess).toBe(phone.tokens.hostess);        // the phone's rotation holds
    // and it pushes that way
    expect(mapLocalEventToCloudPayload(out, "u1").collab_token ?? out.tokens.collab).toBe(laptop.tokens.collab);
  });

  it("the per-link times survive the cloud round-trip and a duplicate starts clean", async () => {
    const e = rotateEventToken(normalizeEvent(ev({})), "collab", 1234);
    const back = mapCloudEventToLocalEvent({ ...mapLocalEventToCloudPayload(e, "u1"), id: "c1" });
    expect(normalizeEvent(back).tokenRotations).toEqual({ collab: 1234 });
    const { duplicateEvent } = await import("../utils/eventHelpers.js");
    expect(duplicateEvent(e).tokenRotations).toEqual({});
  });

  it("data from before per-link times: the one timestamp still decides, as it did", () => {
    const base = normalizeEvent(ev({ tokens: { collab: "A" } }));
    const [out] = mergeCloudWithLocal(
      [{ ...base, updatedAt: 9, tokens: { ...base.tokens, collab: "LOCAL" }, tokensRotatedAt: 9, tokenRotations: {} }],
      [{ ...base, updatedAt: 5, tokens: { ...base.tokens, collab: "CLOUD" }, tokensRotatedAt: 5, tokenRotations: {} }]);
    expect(out.tokens.collab).toBe("LOCAL");
  });
});
