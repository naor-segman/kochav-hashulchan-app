import { describe, it, expect } from "vitest";
import { normalizeEvent, duplicateEvent } from "./eventHelpers.js";

describe("normalizeEvent — timestamps", () => {
  it("defaults updatedAt to createdAt (never epoch 0) when both are missing", () => {
    const e = normalizeEvent({ id: "x", name: "t" });
    expect(e.updatedAt).toBe(e.createdAt);
    expect(e.updatedAt).toBeGreaterThan(0);
  });

  it("defaults updatedAt to createdAt when only createdAt is present", () => {
    const e = normalizeEvent({ id: "x", createdAt: 12345 });
    expect(e.updatedAt).toBe(12345);
  });

  it("preserves custom groups and custom table types", () => {
    const e = normalizeEvent({ id: "x", customGroups: ["חברים מהצבא"], customTableTypes: ["שולחן ילדים"] });
    expect(e.customGroups).toEqual(["חברים מהצבא"]);
    expect(e.customTableTypes).toEqual(["שולחן ילדים"]);
  });
});

describe("duplicateEvent", () => {
  const base = normalizeEvent({
    id: "orig", name: "אירוע", cloudId: "cloud-1",
    tables: [{ id: "t1", name: "1", capacity: 10, type: "regular" }],
    guests: [{ id: "g1", name: "א", side: "bride", group: "חברים", count: 1 }],
    seating: { g1: "t1" },
    customGroups: ["חברים מהצבא"],
    customTableTypes: ["שולחן ילדים"],
    tokens: { rsvp: "r", invite: "i", gift: "gf", hostess: "h", collab: "c" },
    eventSite: { enabled: true, schedule: [{ id: "s1", time: "18:00", title: "קבלה" }], sections: {} },
  });

  it("resets cloudId, mints fresh tokens, and clears seating", () => {
    const dup = duplicateEvent(base);
    expect(dup.cloudId).toBeNull();
    expect(dup.tokens.rsvp).not.toBe(base.tokens.rsvp);
    expect(dup.tokens.collab).not.toBe(base.tokens.collab);
    expect(dup.seating).toEqual({});
    expect(dup.id).not.toBe(base.id);
  });

  it("deep-copies nested collections so editing the copy never touches the original", () => {
    const dup = duplicateEvent(base);
    dup.customGroups.push("קבוצה חדשה");
    dup.eventSite.schedule.push({ id: "s2", time: "20:00", title: "ריקודים" });
    expect(base.customGroups).toEqual(["חברים מהצבא"]);   // original unchanged
    expect(base.eventSite.schedule).toHaveLength(1);        // original unchanged
  });
});
