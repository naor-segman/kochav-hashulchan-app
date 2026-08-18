// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";
import { isCloudBacked, pruneCloudBackedEvents } from "../utils/storage.js";

/* THE DATA LOSS THIS FILE EXISTS FOR.
 *
 * `version` is a per-device counter, `syncedVersion` is the server's. In the
 * ORDINARY two-device conflict — one edit on each side — both land on N+1. The
 * merge keeps the local content and takes syncedVersion from the cloud row, so
 * the counters come out EQUAL while the merged content is held by neither side.
 *
 * `isCloudBacked` is `syncedVersion === version`. It therefore answered "the
 * cloud provably holds this event", and `pruneCloudBackedEvents` — which runs
 * automatically on SIGNED_OUT — deleted it from the browser while the cloud
 * still held the pre-conflict copy. The venue, the seating map, the locks, the
 * floor-plan image (which never syncs at all) and the custom groups: gone.
 *
 * storage.js states the asymmetry itself: "a false negative costs a stale copy
 * left on the device, a false positive costs somebody their guest list." These
 * tests are about that one direction.
 */

const NOW = 1_780_000_000_000;

const localEvent = (over = {}) => ({
  id: "e1", cloudId: "c-1", name: "החתונה של דנה ויוסי", type: "חתונה",
  date: "2027-06-01", venue: "היכל החדש שהוקלד עכשיו",
  guests: [{ id: "g1", name: "טל שוורץ", count: 2 }],
  tables: [{ id: "t1", name: "שולחן 1", seats: 10 }],
  seating: { g1: "t1" }, lockedGuests: ["g1"], lockedTables: [],
  constraints: [], tasks: [], vendors: [], costs: {},
  customGroups: ["חברים מהצבא"],
  version: 6, syncedVersion: 5,           // one local edit not yet pushed
  updatedAt: NOW, createdAt: NOW - 99_999,
  ...over,
});

const cloudEvent = (over = {}) => ({
  id: "e1", cloudId: "c-1", name: "החתונה של דנה ויוסי", type: "חתונה",
  date: "2027-06-01", venue: "היכל ישן",
  guests: [{ id: "g2", name: "רון לוי", count: 1 }],
  tables: [], seating: {}, lockedGuests: [], lockedTables: [],
  constraints: [], tasks: [], vendors: [], costs: {}, customGroups: [],
  version: 6, syncedVersion: 6,           // the other device pushed
  updatedAt: NOW - 60_000, createdAt: NOW - 99_999,
  ...over,
});

/** How the CONFLICT RECOVERY calls it: this device failed to push e1. */
const merge = (local, cloud) =>
  mergeCloudWithLocal([local], [cloud],
    { cloudIsAuthoritative: true, fetchedAt: NOW, unpushedIds: new Set(["e1"]) })[0];

/** How HYDRATION calls it: nothing is known to have failed. */
const hydrate = (local, cloud) =>
  mergeCloudWithLocal(local ? [local] : [], [cloud],
    { cloudIsAuthoritative: true, fetchedAt: NOW })[0];

describe("a merged event is never mistaken for one the cloud holds", () => {
  it("keeps the local content when local is newer — the premise of the bug", () => {
    // If this stops being true the rest of the file is testing nothing.
    const m = merge(localEvent(), cloudEvent());
    expect(m.venue).toBe("היכל החדש שהוקלד עכשיו");
    expect(m.seating).toEqual({ g1: "t1" });
  });

  it("does not claim to be cloud-backed", () => {
    const m = merge(localEvent(), cloudEvent());
    expect(isCloudBacked(m), "the cloud holds the OLD venue").toBe(false);
  });

  it("survives the sign-out prune", () => {
    // The end of the chain, through the real prune rather than the predicate:
    // useAuth calls this on SIGNED_OUT with no confirmation of any kind.
    const key = "kochav_prune_probe";
    localStorage.setItem(key, JSON.stringify({ events: [merge(localEvent(), cloudEvent())] }));
    const { removed, kept } = pruneCloudBackedEvents(key);
    expect(removed).toBe(0);
    expect(kept).toBe(1);
    localStorage.removeItem(key);
  });

  it("marks it dirty at exactly the cloud's version plus one", () => {
    // Not version+1: syncedVersion is the base the next push compares against
    // (`.eq("version", syncedVersion)`) and the payload writes `version`. Any
    // other increment either conflicts forever or skips a number.
    const m = merge(localEvent(), cloudEvent());
    expect(m.syncedVersion).toBe(6);
    expect(m.version).toBe(7);
  });

  it("increments from the CLOUD's version, not from the local counter", () => {
    // The fixture above cannot tell the two apart — with syncedVersion 5 and
    // version 6, both `version + 1` and `syncedVersion + 1` give 7, and a
    // mutation swapping them survived the whole suite. This is the case that
    // separates them: three edits made offline, so the local counter has run
    // ahead of the base the next push will actually compare against.
    //
    // It matters because updateCloudEvent sends `.eq("version", syncedVersion)`
    // and writes `version` from the payload. Any value but base+1 either skips
    // numbers the server never issued or — when the local counter is BEHIND —
    // writes a version lower than the row it just overwrote.
    const m = merge(localEvent({ version: 9, syncedVersion: 5 }), cloudEvent());
    expect(m.syncedVersion).toBe(6);
    expect(m.version, "must be one past the cloud's 6, not one past the local 9").toBe(7);
  });

  it("does the same when the CLOUD is newer and local rows were unioned in", () => {
    // The other branch. The cloud wins on scalars, but the union folds this
    // tab's rows back in — so the result is still a third state.
    const local = localEvent({ updatedAt: NOW - 120_000 });
    const m = merge(local, cloudEvent());
    expect(m.guests.map(g => g.id).sort()).toEqual(["g1", "g2"]);
    expect(isCloudBacked(m)).toBe(false);
    expect(m.version).toBe((m.syncedVersion ?? 0) + 1);
  });
});

describe("hydration is untouched — only the failed push marks anything", () => {
  // The opposite error, and it is not free: hydration merges EVERY event on
  // EVERY login. Marking them all would push a host's whole account each time
  // and churn updatedAt on rows nobody touched. Which is why the CALLER
  // decides: pushUpdate knows the server rejected its write, hydration does
  // not know anything of the sort.

  it("leaves an identical pair alone", () => {
    const same = { ...cloudEvent(), version: 6, syncedVersion: 6, updatedAt: NOW - 60_000 };
    const m = hydrate({ ...same }, cloudEvent());
    expect(m.version).toBe(6);
    expect(isCloudBacked(m)).toBe(true);
  });

  it("leaves an event with a local floor plan alone", () => {
    // Comparing content instead of trusting the caller was tried and abandoned:
    // normalizeEvent mints a fresh uuid for every event-site FAQ row and every
    // missing token, so two copies of identical content never serialise the
    // same and EVERY event came out dirty on EVERY login. This fixture is the
    // shape that kept failing.
    const withPlan = {
      ...cloudEvent(), version: 6, syncedVersion: 6, updatedAt: NOW - 60_000,
      floorPlan: { image: "data:image/jpeg;base64,AAAA", tablePositions: {}, elements: [] },
    };
    const m = hydrate(withPlan, cloudEvent());
    expect(m.floorPlan?.image).toBe("data:image/jpeg;base64,AAAA");
    expect(m.version).toBe(6);
  });

  it("does not touch an event that has no local copy at all", () => {
    const m = hydrate(null, cloudEvent());
    expect(m.version).toBe(6);
    expect(isCloudBacked(m)).toBe(true);
  });

  it("marks only the id the caller names, not every event in the account", () => {
    const other = { ...cloudEvent(), id: "e2", cloudId: "c-2", version: 6, syncedVersion: 6,
                    updatedAt: NOW - 60_000 };
    const out = mergeCloudWithLocal(
      [localEvent(), other],
      [cloudEvent(), { ...other }],
      { cloudIsAuthoritative: true, fetchedAt: NOW, unpushedIds: new Set(["e1"]) },
    );
    expect(out.find(e => e.id === "e1").version).toBe(7);
    expect(out.find(e => e.id === "e2").version).toBe(6);
  });
});
