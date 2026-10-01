import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal } from "./useEvents.js";
import { syncBaseOf } from "../utils/syncBase.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* 33e: `eventSite` merged as ONE field. When both devices touched the site —
 * one deleted a gallery photo, the other edited the story — the newer copy won
 * whole and the deleted photo came back. Now per site key against the base. */
const T = 1_790_000_000_000;
const synced = normalizeEvent({
  id: "e1", cloudId: "c-1", name: "x", type: "חתונה",
  eventSite: { gallery: ["https://x/p1.jpg", "https://x/p2.jpg"], story: "s0", coverPhoto: "https://x/c0.jpg" },
  version: 5, syncedVersion: 5, updatedAt: T, createdAt: T - 1000,
});
const base = syncBaseOf(synced);
const site = (over) => ({ ...synced.eventSite, ...over });

describe("event site merges per key (33e)", () => {
  it("local newer edited the story; the photo the other device deleted stays deleted", () => {
    const cloud = { ...synced, eventSite: site({ gallery: ["https://x/p2.jpg"] }), version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...synced, syncBase: base, eventSite: site({ story: "s-B" }), version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.eventSite.gallery).toEqual(["https://x/p2.jpg"]);
    expect(m.eventSite.story).toBe("s-B");
  });

  it("cloud newer: this device's cover change survives beside the cloud's story, and is pushed", () => {
    const cloud = { ...synced, eventSite: site({ story: "s-C" }), version: 6, syncedVersion: 6, updatedAt: T + 30 };
    const local = { ...synced, syncBase: base, eventSite: site({ coverPhoto: null }), version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.eventSite.coverPhoto).toBe(null);
    expect(m.eventSite.story).toBe("s-C");
    expect(m.version).toBe(7);
  });

  it("both changed the same key: the newer copy still wins it", () => {
    const cloud = { ...synced, eventSite: site({ story: "s-C" }), version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...synced, syncBase: base, eventSite: site({ story: "s-L", gallery: [] }), version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.eventSite.story).toBe("s-L");
    expect(m.eventSite.gallery).toEqual([]);
  });

  it("without per-key base (older syncBase) the old whole-field rule is unchanged", () => {
    const old = { ...base }; delete old.siteKeys;
    const cloud = { ...synced, eventSite: site({ gallery: ["https://x/p2.jpg"] }), version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...synced, syncBase: old, eventSite: site({ story: "s-B" }), version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.eventSite.gallery).toEqual(["https://x/p1.jpg", "https://x/p2.jpg"]);
  });
});
