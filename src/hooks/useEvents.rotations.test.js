import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal, afterPush } from "./useEvents.js";
import { syncBaseOf } from "../utils/syncBase.js";
import { normalizeEvent } from "../utils/eventHelpers.js";
import { mapLocalEventToCloudPayload, mapCloudEventToLocalEvent } from "../utils/cloudSync.js";

const T = 1_790_000_000_000;
// A cloud row, in the shape fetchCloudEvents returns (through the real mappers).
function rowOf(ev, version) {
  const p = mapLocalEventToCloudPayload({ ...ev, version }, "u1");
  return mapCloudEventToLocalEvent(JSON.parse(JSON.stringify({ ...p, id: ev.cloudId, version, updated_at: new Date(ev.updatedAt).toISOString() })));
}
// Load → (push if owed) → load … n times. Returns how many loads pushed.
function loads(local, cloudRow, n = 4) {
  let pushes = 0;
  const trail = [];
  for (let i = 0; i < n; i++) {
    const [m] = mergeCloudWithLocal([local], [cloudRow], { cloudIsAuthoritative: true, fetchedAt: Date.now() });
    const owed = m.version !== m.syncedVersion;
    trail.push(owed ? "push" : "in-step");
    if (owed) {
      pushes++;
      const v = cloudRow.syncedVersion + 1;
      // what updateCloudEvent writes, read back
      cloudRow = { ...rowOf(m, v), syncedVersion: v };
      local = afterPush(m, m.version, v, syncBaseOf(m), m.updatedAt, m.localEdits ?? 0);
    } else local = m;
  }
  return { pushes, trail, local, cloudRow };
}

const synced = normalizeEvent({
  id: "e1", cloudId: "c-1", name: "חתונה", type: "חתונה", date: "2027-05-20", venue: "גן",
  guests: [{ id: "g1", name: "רון", count: 2, notes: "" }],
  tables: [{ id: "t1", name: "שולחן 1", capacity: 10 }],
  version: 5, syncedVersion: 5, updatedAt: T, createdAt: T - 1000,
});

/* Sixth review 30.9 (סב90l) — a regression from da2e227. A rotation stamp
 * this version does not know (a newer app added a link type) or a null stamp
 * made the event look owed to the cloud on every load, and every push wrote it
 * back: a new version per load, forever, and every other device pushed into
 * conflict recovery. Four loads through the real mappers. */
describe("an unknown rotation stamp does not make every load a push", () => {
  it("control: a normal rotation map is in step", () => {
    const ev = { ...synced, tokenRotations: { album: T - 5 }, tokensRotatedAt: T - 5 };
    const cloud = { ...rowOf(ev, 5), syncedVersion: 5 };
    expect(loads({ ...normalizeEvent(ev), syncBase: syncBaseOf(cloud) }, cloud).pushes).toBe(0);
  });
  it("a key outside TOKEN_KEYS", () => {
    const ev = { ...synced, tokenRotations: { album: T - 5, door2: T - 3 }, tokensRotatedAt: T - 3 };
    const cloud = { ...rowOf(ev, 5), syncedVersion: 5 };
    const r = loads({ ...normalizeEvent(ev), syncBase: syncBaseOf(cloud) }, cloud);
    expect(r.pushes).toBe(0);
  });
  it("a null stamp", () => {
    const ev = { ...synced, tokenRotations: { album: null }, tokensRotatedAt: T - 3 };
    const cloud = { ...rowOf(ev, 5), syncedVersion: 5 };
    expect(loads({ ...normalizeEvent(ev), syncBase: syncBaseOf(cloud) }, cloud).pushes).toBe(0);
  });
  it("a rotation this device made and has not pushed is still owed", () => {
    const cloud = { ...rowOf({ ...synced, tokenRotations: {} }, 5), syncedVersion: 5 };
    const local = { ...normalizeEvent({ ...synced, tokenRotations: { album: T + 100 }, tokensRotatedAt: T + 100 }), syncBase: syncBaseOf(cloud) };
    const [m] = mergeCloudWithLocal([local], [cloud], { cloudIsAuthoritative: true, fetchedAt: Date.now() });
    expect(m.version).not.toBe(m.syncedVersion);
  });
});
