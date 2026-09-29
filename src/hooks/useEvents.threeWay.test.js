import { describe, it, expect } from "vitest";
import { mergeCloudWithLocal, afterPush } from "./useEvents.js";
import { syncBaseOf } from "../utils/syncBase.js";
import { normalizeEvent } from "../utils/eventHelpers.js";

/* סב55 (third review 30.9). Whole-event "newer updatedAt wins on scalars"
 * reverts a field the OTHER device changed whenever this device edited
 * anything later — a guest note on the laptop brought yesterday's venue back
 * over the one the phone had set, and pushed it. The fix compares both sides
 * with the copy both last agreed on (`syncBase`).
 */

const T = 1_790_000_000_000;

// What both devices held after their last sync.
const synced = normalizeEvent({
  id: "e1", cloudId: "c-1", name: "החתונה של נוי ועידו", type: "חתונה",
  date: "2027-05-20", venue: "גן האירועים הישן",
  guests: [{ id: "g1", name: "רון", count: 2, notes: "" }],
  tables: [{ id: "t1", name: "שולחן 1", capacity: 10 }],
  version: 5, syncedVersion: 5, updatedAt: T, createdAt: T - 1000,
});
const base = syncBaseOf(synced);

describe("three-way merge of single-value fields (סב55)", () => {
  it("a stale device that edited something else does not revert the other device's venue", () => {
    // The phone changed the venue and pushed (cloud v6, updatedAt T+10).
    const cloud = { ...synced, venue: "אולם חדש בהרצליה", version: 6, syncedVersion: 6, updatedAt: T + 10 };
    // The laptop, holding v5, edited a guest note later (T+20) — never saw the venue change.
    const local = {
      ...synced, syncBase: base, version: 6, syncedVersion: 5, updatedAt: T + 20,
      guests: [{ ...synced.guests[0], notes: "צמחוני" }],
    };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.venue).toBe("אולם חדש בהרצליה");
    expect(m.guests[0].notes).toBe("צמחוני");        // its own edit survives
    expect(m.version).toBe(7);                        // and is still owed to the cloud
  });

  it("a newer cloud copy does not overrule a field only this device changed", () => {
    // This device renamed the venue offline; the phone later changed the date.
    const local = { ...synced, syncBase: base, venue: "בית הכנסת הגדול", version: 6, syncedVersion: 5, updatedAt: T + 10 };
    const cloud = { ...synced, date: "2027-05-27", version: 6, syncedVersion: 6, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.venue).toBe("בית הכנסת הגדול");
    expect(m.date).toBe("2027-05-27");
    // The kept venue is not in the cloud, so the event must be pushed.
    expect(m.syncedVersion).toBe(6);
    expect(m.version).toBe(7);
  });

  it("the event site is merged the same way", () => {
    const cloud = { ...synced, eventSite: { ...synced.eventSite, story: "איך הכרנו" }, version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...synced, syncBase: base, name: "נוי ועידו", version: 6, syncedVersion: 5, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.eventSite.story).toBe("איך הכרנו");
    expect(m.name).toBe("נוי ועידו");
  });

  it("when both changed the same field, the newer copy still wins", () => {
    const cloud = { ...synced, venue: "מהטלפון", version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...synced, syncBase: base, venue: "מהמחשב", version: 6, syncedVersion: 5, updatedAt: T + 20 };
    expect(mergeCloudWithLocal([local], [cloud])[0].venue).toBe("מהמחשב");
    const older = { ...local, updatedAt: T + 5 };
    expect(mergeCloudWithLocal([older], [cloud])[0].venue).toBe("מהטלפון");
  });

  it("without a base (events from before this change) the old rule is unchanged", () => {
    const cloud = { ...synced, venue: "אולם חדש", version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const local = { ...synced, syncBase: null, version: 6, syncedVersion: 5, updatedAt: T + 20 };
    expect(mergeCloudWithLocal([local], [cloud])[0].venue).toBe("גן האירועים הישן");
  });

  it("the merge records the cloud row as the next base", () => {
    const cloud = { ...synced, venue: "אולם חדש", version: 6, syncedVersion: 6, updatedAt: T + 10 };
    const [m] = mergeCloudWithLocal([], [cloud]);
    expect(m.syncBase).toEqual(syncBaseOf(cloud));
    const [m2] = mergeCloudWithLocal([{ ...synced, syncBase: base, updatedAt: T + 20 }], [cloud]);
    expect(m2.syncBase).toEqual(syncBaseOf(cloud));
  });

  it("a push that landed records what was sent as the base — not what was typed meanwhile", () => {
    const sent = { ...synced, venue: "נשלח", version: 6 };
    const now  = { ...sent, venue: "הוקלד בזמן השליחה", version: 7 };
    const after = afterPush(now, 6, 6, syncBaseOf(sent));
    expect(after.syncBase).toEqual(syncBaseOf(sent));
    expect(after.syncBase).not.toEqual(syncBaseOf(now));
  });

  it("the base survives the localStorage round-trip through normalizeEvent", () => {
    expect(normalizeEvent({ ...synced, syncBase: base }).syncBase).toEqual(base);
    expect(normalizeEvent({ ...synced, syncBase: [1] }).syncBase).toBe(null);
  });
});
