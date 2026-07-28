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
