import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";

// Hydration decides which copy of an event survives a page load. Getting it
// wrong is not a display bug — it deletes the customer's work and then persists
// the deletion. These pin the rule that was missing entirely.

const ev = (over = {}) => ({
  id: "e1", name: "החתונה", type: "חתונה", date: "2027-06-01", venue: "אולם",
  guests: [], tables: [], seating: {}, constraints: [],
  createdAt: 1000, updatedAt: 1000, version: 1, ...over,
});

const guests = n => Array.from({ length: n }, (_, i) => ({
  id: "g" + i, name: "אורח " + i, side: "bride", group: "משפחה", count: 1,
}));

describe("mergeCloudWithLocal", () => {
  it("keeps the LOCAL copy when it was written more recently than the cloud", () => {
    // The venue-wifi case: 50 guests entered, the debounced push never landed,
    // the host reloads. Taking the cloud copy here lost the 48 newer rows.
    const local = [ev({ guests: guests(50), updatedAt: 9_000_000, version: 6, cloudId: "c1" })];
    const cloud = [ev({ guests: guests(2),  updatedAt: 1_000,     version: 5, cloudId: "c1" })];

    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests).toHaveLength(50);
    expect(out.updatedAt).toBe(9_000_000);
  });

  it("keeps the CLOUD copy when it is the newer side", () => {
    // The other device edited it — that work must not be thrown away either.
    const local = [ev({ guests: guests(2),  updatedAt: 1_000,     cloudId: "c1" })];
    const cloud = [ev({ guests: guests(40), updatedAt: 9_000_000, cloudId: "c1" })];

    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests).toHaveLength(40);
  });

  it("always takes cloudId from the cloud, even when local wins on freshness", () => {
    // Otherwise a newer local copy with no cloudId detaches the event from its
    // cloud row and it starts syncing as a second, duplicate event.
    const local = [ev({ guests: guests(9), updatedAt: 9_000_000, cloudId: null })];
    const cloud = [ev({ guests: guests(1), updatedAt: 1_000,     cloudId: "c1" })];

    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.cloudId).toBe("c1");
    expect(out.guests).toHaveLength(9);
  });

  it("never lets a stale local copy resurrect a null public token", () => {
    // Tokens are minted on first sync. A local copy that predates that push has
    // none; restoring it would break every printed QR code and shared link.
    const local = [ev({ updatedAt: 9_000_000, cloudId: "c1", tokens: null })];
    const cloud = [ev({
      updatedAt: 1_000, cloudId: "c1",
      tokens: { rsvp: "r1", invite: "i1", gift: "g1", hostess: "h1", collab: "c1", album: "a1" },
    })];

    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.rsvp).toBe("r1");
    expect(out.tokens.invite).toBe("i1");
  });

  it("keeps a local-only event that the cloud has never seen", () => {
    const local = [ev({ id: "draft", cloudId: null })];
    const out = mergeCloudWithLocal(local, []);
    expect(out.map(e => e.id)).toEqual(["draft"]);
  });

  it("treats a missing updatedAt as oldest rather than throwing", () => {
    const local = [ev({ guests: guests(3), updatedAt: undefined, cloudId: "c1" })];
    const cloud = [ev({ guests: guests(7), updatedAt: 5_000,     cloudId: "c1" })];
    expect(mergeCloudWithLocal(local, cloud)[0].guests).toHaveLength(7);
  });
});

// ── Arrivals marked at the door survive the host's next edit ─────────────────
// The one field on this row written by SOMEONE ELSE, on a device this tab never
// sees. Whole-event last-write-wins cannot be right for it: the host edits the
// venue at 20:32, their copy is newer by definition, and everyone the greeter
// checked in at 20:31 is dropped and then pushed back over the cloud. Measured
// before the fix: the venue edit survived, three arrivals did not.
describe("mergeCloudWithLocal — arrivals marked at the door", () => {
  const withArrivals = (over = {}) => ({
    ...ev(over),
    guests: [
      { id: "g1", name: "דודה רחל", side: "bride", group: "משפחה", count: 5 },
      { id: "g2", name: "משה כהן",  side: "groom", group: "חברים", count: 2 },
    ],
  });
  const cloudSide = () => {
    const e = withArrivals({ updatedAt: 20_310, cloudId: "c1" });
    e.guests[0] = { ...e.guests[0], arrivedSeats: [0, 1, 2], arrived: true };
    return e;
  };

  it("keeps the greeter's arrivals when the host edited something else after", () => {
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1", venue: "אולמי הגן" })];
    const [out] = mergeCloudWithLocal(local, [cloudSide()]);
    expect(out.venue).toBe("אולמי הגן");            // the host's edit still wins
    expect(out.guests[0].arrivedSeats).toEqual([0, 1, 2]);
    expect(out.guests[0].arrived).toBe(true);
  });

  it("does NOT resurrect someone the host deliberately un-marked", () => {
    // [] is an opinion — "nobody from this row" — and must not lose to the
    // cloud. undefined is silence, and that is the only thing we override.
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1" })];
    local[0].guests[0] = { ...local[0].guests[0], arrivedSeats: [], arrived: false };
    const [out] = mergeCloudWithLocal(local, [cloudSide()]);
    expect(out.guests[0].arrivedSeats).toEqual([]);
    expect(out.guests[0].arrived).toBe(false);
  });

  it("leaves the host's own marking alone", () => {
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1" })];
    local[0].guests[0] = { ...local[0].guests[0], arrivedSeats: [4], arrived: true };
    const [out] = mergeCloudWithLocal(local, [cloudSide()]);
    expect(out.guests[0].arrivedSeats).toEqual([4]);
  });

  it("never adds or removes a guest row", () => {
    const local = [withArrivals({ updatedAt: 20_320, cloudId: "c1" })];
    const cloud = [cloudSide()];
    cloud[0].guests.push({ id: "g9", name: "פולשת", side: "bride", group: "אחר", count: 1,
      arrivedSeats: [0], arrived: true });
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.guests.map(g => g.id)).toEqual(["g1", "g2"]);
  });

  it("touches nothing when the cloud is the side that wins", () => {
    const local = [withArrivals({ updatedAt: 1_000, cloudId: "c1" })];
    const [out] = mergeCloudWithLocal(local, [cloudSide()]);
    expect(out.guests[0].arrivedSeats).toEqual([0, 1, 2]);
  });
});

// ── A revoked link stays revoked ─────────────────────────────────────────────
// Rotation is the only way to take back a public link. This merge used to let
// the CLOUD's token win per key, so a host who killed a leaked link and then
// reloaded before the debounced push landed got the dead link back — and a
// second device holding the old token pushed it back over the new one.
// Revocation that can be silently undone is not revocation.
describe("mergeCloudWithLocal — a rotated token is not resurrected", () => {
  const withTokens = (collab, rotatedAt, over = {}) => ({
    ...ev(over),
    cloudId: "c1",
    tokensRotatedAt: rotatedAt,
    tokens: { rsvp: "R", invite: "I", gift: "G", hostess: "H", album: "A", collab },
  });

  it("keeps the NEW token when this device is the one that rotated", () => {
    const local = [withTokens("new-token", 9_000, { updatedAt: 9_000 })];
    const cloud = [withTokens("leaked-token", null, { updatedAt: 1_000 })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.collab).toBe("new-token");
    expect(out.tokensRotatedAt).toBe(9_000);
  });

  it("takes the rotation from the cloud when the OTHER device rotated", () => {
    // The host killed the link on their phone; this laptop still holds the old
    // one and happens to have a newer updatedAt for unrelated reasons.
    const local = [withTokens("leaked-token", null,  { updatedAt: 9_000 })];
    const cloud = [withTokens("new-token",    8_000, { updatedAt: 1_000 })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.collab).toBe("new-token");
  });

  it("the most recent rotation wins when both sides rotated", () => {
    const local = [withTokens("phone-token",  7_000, { updatedAt: 9_000 })];
    const cloud = [withTokens("laptop-token", 8_000, { updatedAt: 1_000 })];
    expect(mergeCloudWithLocal(local, cloud)[0].tokens.collab).toBe("laptop-token");
  });

  it("on an exact tie the cloud wins, same as with no rotation at all", () => {
    // Two devices stamped the same millisecond. Either answer is defensible;
    // what is not defensible is leaving it unpinned, so it follows the
    // no-rotation rule rather than inventing a second one.
    const local = [withTokens("phone-token",  8_000, { updatedAt: 9_000 })];
    const cloud = [withTokens("laptop-token", 8_000, { updatedAt: 1_000 })];
    expect(mergeCloudWithLocal(local, cloud)[0].tokens.collab).toBe("laptop-token");
  });

  it("carries the rotation stamp forward even when the token came from the cloud", () => {
    // Local wins on updatedAt but never rotated; the cloud did. If the merged
    // event forgets WHEN, the next merge has no way to know the cloud's token
    // is the deliberate one.
    const local = [withTokens("leaked-token", null,  { updatedAt: 9_000 })];
    const cloud = [withTokens("new-token",    8_000, { updatedAt: 1_000 })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.collab).toBe("new-token");
    expect(out.tokensRotatedAt).toBe(8_000);
  });

  it("with no rotation on either side, the cloud still wins — unchanged", () => {
    const local = [withTokens("older", null, { updatedAt: 9_000 })];
    const cloud = [withTokens("cloud", null, { updatedAt: 1_000 })];
    expect(mergeCloudWithLocal(local, cloud)[0].tokens.collab).toBe("cloud");
  });

  it("a rotation never resurrects a token the other side has and it does not", () => {
    // The guard that was there before: a local copy predating a token must not
    // erase it. Rotating one key must not drop the others.
    const local = [{ ...withTokens("new-token", 9_000, { updatedAt: 9_000 }),
      tokens: { rsvp: null, invite: null, gift: null, hostess: null, album: null, collab: "new-token" } }];
    const cloud = [withTokens("leaked-token", null, { updatedAt: 1_000 })];
    const [out] = mergeCloudWithLocal(local, cloud);
    expect(out.tokens.collab).toBe("new-token");
    expect(out.tokens.rsvp).toBe("R");
    expect(out.tokens.album).toBe("A");
  });
});
