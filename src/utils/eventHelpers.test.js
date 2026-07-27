import { describe, it, expect } from "vitest";
import { normalizeEvent, duplicateEvent, seatingTotals } from "./eventHelpers.js";

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

describe("seatingTotals — declined guests can't inflate the counters", () => {
  const ev = {
    guests: [
      { id: "a", count: 4, rsvp: "confirmed" },
      { id: "b", count: 6, rsvp: "pending" },
      { id: "c", count: 7, rsvp: "confirmed" },
      { id: "d", count: 2, rsvp: "declined" }, // declined but still seated
    ],
    seating: { a: "t1", b: "t1", d: "t2" },
  };

  it("counts seats active-only on both sides (the 19/17 bug)", () => {
    const t = seatingTotals(ev.guests, ev.seating);
    // a(4) + b(6) seated = 10 — the declined d(2) must NOT be added
    expect(t.assignedSeats).toBe(10);
    // a(4) + b(6) + c(7) = 17 — declined excluded here too
    expect(t.totalSeats).toBe(17);
    expect(t.assignedSeats).toBeLessThanOrEqual(t.totalSeats);
  });

  it("counts records active-only on both sides", () => {
    const t = seatingTotals(ev.guests, ev.seating);
    expect(t.assignedRecords).toBe(2);
    expect(t.totalRecords).toBe(3);
  });

  it("treats a missing/zero/negative count as one seat", () => {
    const t = seatingTotals(
      [{ id: "x" }, { id: "y", count: 0 }, { id: "z", count: -3 }],
      { x: "t1", y: "t1", z: "t1" }
    );
    expect(t.assignedSeats).toBe(3);
    expect(t.totalSeats).toBe(3);
  });

  it("survives empty / missing input", () => {
    expect(seatingTotals(undefined, undefined)).toEqual({
      assignedRecords: 0, totalRecords: 0, assignedSeats: 0, totalSeats: 0,
    });
  });
});

describe("floorPlan.elements — venue fixtures", () => {
  it("normalizes to an empty array for plans that predate the field", () => {
    const e = normalizeEvent({ id: "x", name: "t", floorPlan: { image: "img", tablePositions: { t1: { x: 0.5, y: 0.5 } } } });
    expect(e.floorPlan.elements).toEqual([]);
    expect(e.floorPlan.tablePositions).toEqual({ t1: { x: 0.5, y: 0.5 } });
  });

  it("keeps existing fixtures untouched", () => {
    const els = [{ id: "el1", kind: "chuppah", x: 0.2, y: 0.3, size: 1 }];
    const e = normalizeEvent({ id: "x", name: "t", floorPlan: { image: null, tablePositions: {}, elements: els } });
    expect(e.floorPlan.elements).toEqual(els);
  });

  it("discards a non-array elements value rather than trusting it", () => {
    const e = normalizeEvent({ id: "x", name: "t", floorPlan: { image: null, tablePositions: {}, elements: "nope" } });
    expect(e.floorPlan.elements).toEqual([]);
  });

  it("gives duplicated events fresh fixture ids so the copy shares no identity", () => {
    const src = normalizeEvent({
      id: "x", name: "מקור",
      tables: [{ id: "t1", name: "1", capacity: 10 }],
      floorPlan: {
        image: null,
        tablePositions: { t1: { x: 0.1, y: 0.1 } },
        elements: [{ id: "el1", kind: "stage", x: 0.4, y: 0.4, size: 1 }],
      },
    });
    const copy = duplicateEvent(src);
    expect(copy.floorPlan.elements).toHaveLength(1);
    expect(copy.floorPlan.elements[0].kind).toBe("stage");
    expect(copy.floorPlan.elements[0].id).not.toBe("el1");
    // the table position was remapped to the copy's new table id
    expect(Object.keys(copy.floorPlan.tablePositions)).not.toContain("t1");
  });
});

describe("normalizeEventSite — heading font", () => {
  it("defaults to the serif family for sites that predate the field", () => {
    const e = normalizeEvent({ id: "x", name: "t", type: "wedding", eventSite: { enabled: true } });
    expect(e.eventSite.fontKey).toBe("serif");
  });

  it("keeps an explicit choice", () => {
    const e = normalizeEvent({ id: "x", name: "t", type: "wedding", eventSite: { enabled: true, fontKey: "display" } });
    expect(e.eventSite.fontKey).toBe("display");
  });
});

describe("tasks", () => {
  it("normalizes to an empty array for events that predate the board", () => {
    expect(normalizeEvent({ id: "x", name: "t" }).tasks).toEqual([]);
  });

  it("rejects a non-array tasks value", () => {
    expect(normalizeEvent({ id: "x", name: "t", tasks: "nope" }).tasks).toEqual([]);
  });

  it("carries tasks into a duplicate but resets them to a clean board", () => {
    const src = normalizeEvent({
      id: "x", name: "מקור",
      tasks: [
        { id: "t1", title: "לסגור אולם", status: "done",  doneAt: 123, priority: "high" },
        { id: "t2", title: "לסגור DJ",   status: "doing", doneAt: null, priority: "normal" },
      ],
    });
    const copy = duplicateEvent(src);
    expect(copy.tasks).toHaveLength(2);
    expect(copy.tasks.map(t => t.title)).toEqual(["לסגור אולם", "לסגור DJ"]);
    expect(copy.tasks.every(t => t.status === "todo")).toBe(true);
    expect(copy.tasks.every(t => t.doneAt === null)).toBe(true);
    expect(copy.tasks.map(t => t.id)).not.toContain("t1");
  });
});

describe("vendors", () => {
  it("normalizes to an empty list for events that predate the feature", () => {
    expect(normalizeEvent({ id: "x", name: "t" }).vendors).toEqual([]);
  });
  it("rejects a non-array value", () => {
    expect(normalizeEvent({ id: "x", name: "t", vendors: "nope" }).vendors).toEqual([]);
  });
  it("keeps an existing list untouched", () => {
    const vendors = [{ id: "v1", name: "אולמי הגן", status: "booked" }];
    expect(normalizeEvent({ id: "x", name: "t", vendors }).vendors).toEqual(vendors);
  });
});
