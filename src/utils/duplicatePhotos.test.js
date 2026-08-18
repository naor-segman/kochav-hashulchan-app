import { describe, it, expect } from "vitest";
import { duplicateEvent, normalizeEvent } from "./eventHelpers.js";
import { eventPhotoUrls } from "./photoRetention.js";

/* THE FAILURE: "duplicate last year's event" pointed two events at one folder.
 *
 * A stored photo's path is `${cloudId}/…`. `duplicateEvent` deep-copied
 * `eventSite` and `announcements` — URLs included — and set `cloudId: null`, so
 * the copy named the ORIGINAL's objects. Every deletion route reaches them:
 *
 *   • The Storage RLS delete policy only asks that the folder be an event the
 *     caller owns, and the host owns the original. Replacing the cover photo on
 *     the copy therefore broke the original's LIVE guest site, silently.
 *   • `photo_purge_due` reads URLs out of the payload and the purge deletes
 *     exactly those paths, so whichever event fell due first destroyed the
 *     other's photos — and the survivor's payload still pointed at them with
 *     `photosPurgedAt` null, so nothing in the product knew.
 *
 * The rule: a duplicate starts with no stored photos. It has no folder of its
 * own until its first push, and the host re-uploads what they want.
 */

const STORED = (n) => `https://x.supabase.co/storage/v1/object/public/event-site/EV-1/${n}.jpg`;
const LEGACY = "data:image/jpeg;base64,AAAA";

const original = () => normalizeEvent({
  id: "e1", cloudId: "EV-1", name: "החתונה של דנה ויוסי", type: "חתונה", date: "2026-06-01",
  guests: [{ id: "g1", name: "טל", count: 2 }],
  tables: [{ id: "t1", name: "שולחן 1", seats: 10 }],
  eventSite: {
    coverPhoto: STORED("cover"),
    gallery: [STORED("a"), STORED("b"), LEGACY],
    photosKeepUntil: "2026-08-01",
    photosPurgedAt: null,
  },
  announcements: {
    saveTheDate: { published: true, photo: STORED("std") },
    invitation:  { published: true, photo: LEGACY },
  },
});

describe("a duplicate does not share the original's photos", () => {
  it("carries no stored photo at all", () => {
    const copy = duplicateEvent(original());
    const shared = eventPhotoUrls(copy).filter(u => u.includes("/EV-1/"));
    expect(shared, "the copy still names the original's objects").toEqual([]);
  });

  it("drops the cover, the gallery images and the announcement photo", () => {
    const copy = duplicateEvent(original());
    expect(copy.eventSite.coverPhoto).toBeNull();
    expect(copy.eventSite.gallery).not.toContain(STORED("a"));
    expect(copy.eventSite.gallery).not.toContain(STORED("b"));
    expect(copy.announcements.saveTheDate.photo).toBeNull();
  });

  it("keeps a legacy data: photo, which belongs to no folder", () => {
    // These carry their own bytes. Dropping them would lose the picture for no
    // safety gain, and they cannot be deleted out from under anyone.
    const copy = duplicateEvent(original());
    expect(copy.eventSite.gallery).toContain(LEGACY);
    expect(copy.announcements.invitation.photo).toBe(LEGACY);
  });

  it("does not inherit a retention postponement or a purge record", () => {
    // Both are the SERVER's bookkeeping about the original's objects. Carried
    // over, the copy claims a postponement nobody granted it.
    const copy = duplicateEvent(original());
    expect(copy.eventSite.photosKeepUntil).toBeNull();
    expect(copy.eventSite.photosPurgedAt).toBeNull();
  });

  it("leaves the ORIGINAL untouched", () => {
    // The strip runs on a deep copy. Mutating the source instead would delete
    // the host's real photos the moment they pressed "duplicate".
    const src = original();
    duplicateEvent(src);
    expect(src.eventSite.coverPhoto).toBe(STORED("cover"));
    expect(src.eventSite.gallery).toHaveLength(3);
    expect(src.announcements.saveTheDate.photo).toBe(STORED("std"));
    expect(src.eventSite.photosKeepUntil).toBe("2026-08-01");
  });

  it("still copies everything a duplicate is for", () => {
    const copy = duplicateEvent(original());
    expect(copy.guests).toHaveLength(1);
    expect(copy.tables).toHaveLength(1);
    expect(copy.type).toBe("חתונה");
    expect(copy.cloudId).toBeNull();
  });

  it("survives an event with no site and no announcements", () => {
    const bare = normalizeEvent({ id: "e2", name: "אירוע", type: "חתונה" });
    expect(() => duplicateEvent(bare)).not.toThrow();
  });
});
