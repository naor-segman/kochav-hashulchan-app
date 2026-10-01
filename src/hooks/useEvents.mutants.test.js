// mergeCloudWithLocal — the five mutants that passed the whole suite (third
// review, 29.9). Each was a one-token edit to the merge that decides which copy
// of a host's event survives a login, and nothing in the repo noticed any of
// them. Every test below states the real-world sequence that loses data, then
// asserts the value that sequence depends on.
//
// One survivor is NOT tested here, because no input distinguishes it:
// pruneArrangement's `lockedTables` filter — both branches already filter locks
// against the merged tables before it runs. A differential fuzz (20,000 random
// merges, original vs mutant, same uid sequence) found 0 differences.
//
// mergeSeating's `tableExists` check was argued equivalent on the same grounds
// ("pruneArrangement drops a seat at a missing table anyway") and the same fuzz
// disproved it: 1,199 of 20,000. See the last test in this file.
import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";
import { TOKEN_KEYS } from "../utils/eventHelpers.js";

const ev = (over = {}) => ({
  id: "e1", name: "x", type: "חתונה", cloudId: "c1",
  guests: [], tables: [], seating: {}, constraints: [],
  createdAt: 1000, updatedAt: 1000, version: 5, syncedVersion: 5, ...over,
});

describe("a tie on updatedAt goes to the CLOUD copy", () => {
  // The greeter checks a family in at the door. The arrival RPC bumps the
  // row's `version` column 5 → 6 and does NOT touch payload.updatedAt — every
  // definer function that edits a row-merged collection works that way. So the
  // host's reload sees two copies with the SAME updatedAt and different versions.
  //
  // If the tie went local, the merge kept version 5 while taking syncedVersion 6
  // from the row; the host's next edit bumps to 6 and pushes `.eq("version", 6)`,
  // which matches, and writes version 6 over a row already at 6. The server's
  // counter has stopped moving, and the next device still holding 6 overwrites
  // the host's edit without a conflict — the lost update the version column
  // exists to prevent.
  it("the merged event carries the cloud's version", () => {
    const local = [ev({ guests: [{ id: "g1", name: "כהן", count: 2 }] })];
    const cloud = [ev({ version: 6, syncedVersion: 6,
      guests: [{ id: "g1", name: "כהן", count: 2, arrivedSeats: [0, 1], arrived: true, arrivedAt: 5000 }] })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.version).toBe(6);
    expect(out.syncedVersion).toBe(6);
  });
});

describe("tokens: a key neither side has is minted, not nulled", () => {
  // The cloud row predates a token kind (e.g. a row pushed before `collab` or
  // `album` existed) and so does this device's copy. normalizeEvent mints the
  // missing ones — but the per-key merge then overwrote them with
  // `cloud[k] || local[k] || null`, and nothing after the merge re-normalizes.
  // A null token past the merge is persisted and pushed (the up-mapper writes
  // `tokens.album ?? null` into payload.albumToken, the key the album RPCs
  // authorise against), so the link built from it has nothing to match.
  it("every token key comes out as a string", () => {
    const local = [ev({ tokens: { rsvp: "R1" } })];
    const cloud = [ev({ updatedAt: 2000, tokens: { rsvp: "R1" } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    for (const k of TOKEN_KEYS) expect(typeof out.tokens[k], k).toBe("string");
    expect(out.tokens.rsvp).toBe("R1");
  });
});

describe("tokenRotations keeps the LATER rotation of each link", () => {
  // The per-link rotation time is how the NEXT merge decides whose token wins.
  // Keeping the earlier of the two makes a device that rotated look like it
  // did so before the other copy was written — and then the revoked link wins
  // the next merge and is pushed back out. Revocation that can be undone by a
  // reload is not revocation.
  it("local rotated later → local's time", () => {
    const local = [ev({ tokens: { rsvp: "NEW" }, tokenRotations: { rsvp: 9000 } })];
    const cloud = [ev({ updatedAt: 2000, tokens: { rsvp: "OLD" }, tokenRotations: { rsvp: 3000 } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokenRotations.rsvp).toBe(9000);
    expect(out.tokens.rsvp).toBe("NEW");
  });
  it("cloud rotated later → cloud's time", () => {
    const local = [ev({ tokens: { rsvp: "OLD" }, tokenRotations: { rsvp: 3000 } })];
    const cloud = [ev({ updatedAt: 2000, tokens: { rsvp: "NEW" }, tokenRotations: { rsvp: 9000 } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokenRotations.rsvp).toBe(9000);
    expect(out.tokens.rsvp).toBe("NEW");
  });
});

describe("messageTemplates: union of keys, the WINNING side's text on a clash", () => {
  // The host rewrites the invitation wording on the laptop; the phone added a
  // reminder template earlier. Whichever copy is newer keeps its wording for a
  // template both have — otherwise the host's rewrite silently reverts to the
  // text they just replaced, and the next send goes out with it.
  it("local newer → local's invitation text, cloud's extra reminder kept", () => {
    const local = [ev({ updatedAt: 9000, messageTemplates: { invite: "LOCAL" } })];
    const cloud = [ev({ updatedAt: 5000, messageTemplates: { invite: "CLOUD", reminder: "R" } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.messageTemplates).toEqual({ invite: "LOCAL", reminder: "R" });
  });
  it("cloud newer → cloud's invitation text, local's extra reminder kept", () => {
    const local = [ev({ updatedAt: 5000, messageTemplates: { invite: "LOCAL", reminder: "R" } })];
    const cloud = [ev({ updatedAt: 9000, messageTemplates: { invite: "CLOUD" } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.messageTemplates).toEqual({ invite: "CLOUD", reminder: "R" });
  });
});

describe("floor-plan rescue keeps the venue fixtures when the cloud has no plan", () => {
  // This device drew the plan (image + chuppah + dance floor) before its first
  // push landed; the cloud copy, newer from another device, has no plan at all.
  // The image rescue rebuilt the plan from `result.floorPlan` — null — so
  // without the local fallback the fixtures came out [] and that is what was
  // persisted. The image survives and everything drawn on it is gone.
  it("elements come from the local plan", () => {
    const fixtures = [{ id: "el1", kind: "chuppah" }, { id: "el2", kind: "dance" }];
    const local = [ev({ tables: [{ id: "t1" }],
      floorPlan: { image: "data:image/png;base64,AAA", tablePositions: { t1: { x: 1, y: 1 } }, elements: fixtures } })];
    const cloud = [ev({ updatedAt: 9000, tables: [{ id: "t1" }], floorPlan: null })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.floorPlan.image).toBe("data:image/png;base64,AAA");
    expect(out.floorPlan.elements).toEqual(fixtures);
  });
});

describe("a local seat at a table that no longer exists does not displace a valid one", () => {
  // Found by fuzz, not by reading. The cloud copy (newer) seats g2 at t2, a
  // real table — while not listing g2 among its guests: an orphan seat, the
  // kind of inconsistent row pruneArrangement exists to survive. This device
  // knows g2 and has it at tGONE, a table deleted since. Without the
  // `tableExists` check the local seat overwrote the cloud's, and then
  // pruneArrangement removed it for pointing at nothing: g2 ended the merge
  // with no seat at all, where either copy on its own had one that worked.
  it("g2 keeps the cloud's seat at t2", () => {
    const local = [ev({ updatedAt: 1000, guests: [{ id: "g1" }, { id: "g2" }], tables: [{ id: "t2" }],
      seating: { g2: "tGONE" } })];
    const cloud = [ev({ updatedAt: 2000, guests: [{ id: "g1" }], tables: [{ id: "t1" }, { id: "t2" }],
      seating: { g1: "t1", g2: "t2" } })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests.map(g => g.id).sort()).toEqual(["g1", "g2"]);
    expect(out.seating.g2).toBe("t2");
  });
});
