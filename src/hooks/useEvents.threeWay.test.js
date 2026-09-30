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

/* Fourth review 30.9 — a fuzz of three devices against a fake cloud with real
 * version checks, 2,000 seeds: 740 failing before these, 11 after. */
describe("what the fourth review's fuzz found in סב55/סב56", () => {
  it("a guest only this device holds keeps the event owed to the cloud, even when the cloud copy is newer", () => {
    // Added offline here; the other device edited something later.
    const local = { ...synced, syncBase: base, version: 6, syncedVersion: 5, updatedAt: T + 10,
      guests: [...synced.guests, { id: "gA", name: "נוסף כאן", count: 1 }] };
    const cloud = { ...synced, venue: "אולם", version: 6, syncedVersion: 6, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([local], [cloud]);
    expect(m.guests.map(g => g.id)).toContain("gA");
    // version === syncedVersion read as "the cloud holds this": never pushed,
    // and deleted everywhere by the sign-out prune.
    expect(m.version).not.toBe(m.syncedVersion);
  });

  it("an identical copy is still NOT marked (no push on every login)", () => {
    const cloud = { ...synced, version: 6, syncedVersion: 6, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([{ ...cloud, syncBase: base }], [cloud]);
    expect(m.version).toBe(m.syncedVersion);
  });

  it("a slow fetch answering after a faster one does not put old values back", () => {
    const v5 = { ...synced, version: 5, syncedVersion: 5, venue: "מהמכשיר השני", updatedAt: T + 50 };
    const local = { ...synced, syncBase: base, version: 6, syncedVersion: 5, updatedAt: T + 10 };
    const [a] = mergeCloudWithLocal([local], [v5], { unpushedIds: new Set(["e1"]) });
    const stale = { ...synced, version: 4, syncedVersion: 4 };
    const [b] = mergeCloudWithLocal([{ ...a, syncBase: syncBaseOf(v5) }], [stale], { unpushedIds: new Set(["e1"]) });
    expect(b.venue).toBe("מהמכשיר השני");
    expect(b.syncedVersion).toBe(5);
  });

  it("an acknowledged push does not mark an edit made on the same version number as synced", () => {
    // A merge on the wire reset the counter; the next edit landed on the number sent.
    const sent = { ...synced, version: 4, updatedAt: T + 1 };
    const now  = { ...synced, version: 4, updatedAt: T + 2, name: "נערך אחרי השליחה" };
    const after = afterPush(now, sent.version, 4, syncBaseOf(sent), sent.updatedAt);
    expect(after.version).not.toBe(after.syncedVersion);
    expect(afterPush(sent, sent.version, 4, syncBaseOf(sent), sent.updatedAt).version).toBe(4);
  });
});

describe("what the fifth review found in סב67", () => {
  it("an expired tombstone in the cloud row does not make every load a push", () => {
    const old = Date.now() - 200 * 86400000;              // past the 180-day age
    const cloud = { ...synced, version: 6, syncedVersion: 6, updatedAt: T + 20, deletedRows: { guests: { gx: old } } };
    const [first] = mergeCloudWithLocal([], [cloud]);
    const [again] = mergeCloudWithLocal([first], [cloud]);
    expect(again.version).toBe(again.syncedVersion);
  });

  it("a stale device does not bring back a custom group the other device removed", () => {
    const withGroup = { ...synced, customGroups: ["עבודה"], messageTemplates: { invite: "טקסט שלי" } };
    const b = syncBaseOf(withGroup);
    const laptop = { ...withGroup, syncBase: b, version: 5, syncedVersion: 5, updatedAt: T };
    const cloud  = { ...withGroup, customGroups: [], messageTemplates: {}, version: 6, syncedVersion: 6, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([laptop], [cloud]);
    expect(m.customGroups).toEqual([]);
    expect(m.messageTemplates).toEqual({});
    expect(m.version).toBe(m.syncedVersion);              // nothing to push
  });

  it("a group added on this device is still kept, and pushed", () => {
    const b = syncBaseOf(synced);
    const laptop = { ...synced, customGroups: ["מילואים"], syncBase: b, version: 6, syncedVersion: 5, updatedAt: T + 5 };
    const cloud  = { ...synced, venue: "אולם", version: 6, syncedVersion: 6, updatedAt: T + 20 };
    const [m] = mergeCloudWithLocal([laptop], [cloud]);
    expect(m.customGroups).toEqual(["מילואים"]);
    expect(m.version).not.toBe(m.syncedVersion);
  });
});
