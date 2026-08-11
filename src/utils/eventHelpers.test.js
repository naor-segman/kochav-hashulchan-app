import { describe, it, expect } from "vitest";
import { normalizeEvent, duplicateEvent, seatingTotals, TOKEN_KEYS, rotateEventToken } from "./eventHelpers.js";

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

// A mutation run once showed 10 of 10 destructive edits to normalizeEvent
// passing the whole suite: the defaults it hands out were never asserted, only
// its timestamp handling was. These pin the actual contract — every field the
// rest of the app reads without checking, and the guards that stop a corrupt
// stored value from reaching a screen.
describe("normalizeEvent — the defaults every screen relies on", () => {
  it("returns null for anything that is not an object", () => {
    expect(normalizeEvent(null)).toBeNull();
    expect(normalizeEvent(undefined)).toBeNull();
    expect(normalizeEvent("null")).toBeNull();   // valid JSON, wrong shape — froze an account once
    expect(normalizeEvent(42)).toBeNull();
    expect(normalizeEvent([])).not.toBeNull();   // arrays are objects; documented, not desired
  });

  it("fills identity and display fields for a bare event", () => {
    const e = normalizeEvent({});
    expect(e.id).toBeTruthy();
    expect(e.name).toBe("");
    expect(e.date).toBe("");
    expect(e.venue).toBe("");
    expect(e.brideName).toBe("");
    expect(e.groomName).toBe("");
    expect(e.celebrantName).toBe("");
    expect(e.organizationName).toBe("");
    expect(e.contactName).toBe("");
    expect(e.ownerName).toBe("");
    expect(e.giftBitPhone).toBe("");
    expect(e.giftPayboxLink).toBe("");
  });

  // The Hebrew string is the value the whole app compares against. An English
  // key here would silently match nothing and fall through to a default.
  it("defaults type to the Hebrew 'חתונה' and coupleType to bride-groom", () => {
    const e = normalizeEvent({});
    expect(e.type).toBe("חתונה");
    expect(e.coupleType).toBe("bride-groom");
  });

  it("defaults every collection to an empty array or object", () => {
    const e = normalizeEvent({});
    expect(e.tables).toEqual([]);
    expect(e.guests).toEqual([]);
    expect(e.constraints).toEqual([]);
    expect(e.seating).toEqual({});
    expect(e.lockedGuests).toEqual([]);
    expect(e.lockedTables).toEqual([]);
    expect(e.tasks).toEqual([]);
    expect(e.vendors).toEqual([]);
    expect(e.costs).toEqual({});
    expect(e.messagesSent).toEqual({});
    expect(e.messageTemplates).toEqual({});
    expect(e.floorPlan).toBeNull();
  });

  // A stored value of the wrong type must not reach a screen that will call
  // .map on it — that is a white screen, not a degraded one.
  it("replaces corrupt stored values with the right empty type", () => {
    const e = normalizeEvent({
      tables: "not-an-array", guests: null, constraints: 7, seating: "x",
      lockedGuests: {}, lockedTables: "y", tasks: 3, vendors: null,
      costs: "z", messagesSent: [], messageTemplates: 5,
    });
    expect(e.tables).toEqual([]);
    expect(e.guests).toEqual([]);
    expect(e.constraints).toEqual([]);
    expect(e.seating).toEqual({});
    expect(e.lockedGuests).toEqual([]);
    expect(e.lockedTables).toEqual([]);
    expect(e.tasks).toEqual([]);
    expect(e.vendors).toEqual([]);
    expect(e.costs).toEqual({});
    expect(e.messageTemplates).toEqual({});
  });

  it("defaults version to 1 and cloudId to null, and preserves both when set", () => {
    const bare = normalizeEvent({});
    expect(bare.version).toBe(1);
    expect(bare.cloudId).toBeNull();
    const kept = normalizeEvent({ version: 9, cloudId: "row-uuid" });
    expect(kept.version).toBe(9);
    expect(kept.cloudId).toBe("row-uuid");
  });

  it("trims side labels and drops a non-object to null", () => {
    expect(normalizeEvent({ sideLabels: { bride: "  צד שלה  ", groom: "צד שלו " } }).sideLabels)
      .toEqual({ bride: "צד שלה", groom: "צד שלו" });
    expect(normalizeEvent({ sideLabels: { bride: "רק אחד" } }).sideLabels)
      .toEqual({ bride: "רק אחד", groom: "" });
    expect(normalizeEvent({ sideLabels: "לא אובייקט" }).sideLabels).toBeNull();
    expect(normalizeEvent({}).sideLabels).toBeNull();
  });

  // noShowPct feeds the meal-count forecast the host gives the venue, so a
  // corrupt value must not become NaN meals.
  it("guards noShowPct against non-finite values but keeps a real 0", () => {
    expect(normalizeEvent({}).noShowPct).toBe(10);
    expect(normalizeEvent({ noShowPct: NaN }).noShowPct).toBe(10);
    expect(normalizeEvent({ noShowPct: "12" }).noShowPct).toBe(10);
    expect(normalizeEvent({ noShowPct: null }).noShowPct).toBe(10);
    expect(normalizeEvent({ noShowPct: 0 }).noShowPct).toBe(0);
    expect(normalizeEvent({ noShowPct: 15 }).noShowPct).toBe(15);
  });

  it("normalizes a partial floorPlan without losing positions or elements", () => {
    const e = normalizeEvent({ floorPlan: { tablePositions: { t1: { x: 0.5, y: 0.5 } } } });
    expect(e.floorPlan.image).toBeNull();
    expect(e.floorPlan.tablePositions).toEqual({ t1: { x: 0.5, y: 0.5 } });
    expect(e.floorPlan.elements).toEqual([]);
  });

  it("is idempotent — normalizing twice changes nothing", () => {
    const once  = normalizeEvent({ name: "אירוע", guests: [{ id: "g1", name: "א" }] });
    const twice = normalizeEvent(once);
    expect(twice).toEqual(once);
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

  // The copy used to come back without an `album` token. Nothing failed,
  // because callers happened to pass it through normalizeEvent afterwards,
  // which re-minted the missing key — so a dead album link was one refactor
  // away. Both sides are pinned to the same list now.
  it("mints every public token, not just the ones a caller happens to check", () => {
    const dup = duplicateEvent(base);
    expect(Object.keys(dup.tokens).sort()).toEqual([...TOKEN_KEYS].sort());
    for (const k of TOKEN_KEYS) {
      expect(typeof dup.tokens[k]).toBe("string");
      expect(dup.tokens[k].length).toBeGreaterThan(7);
      expect(dup.tokens[k]).not.toBe(base.tokens[k]);
    }
  });

  it("normalizeEvent fills every token key when the event carries none", () => {
    const e = normalizeEvent({ id: "x" });
    expect(Object.keys(e.tokens).sort()).toEqual([...TOKEN_KEYS].sort());
    expect(new Set(Object.values(e.tokens)).size).toBe(TOKEN_KEYS.length); // all distinct
  });

  it("normalizeEvent keeps existing tokens and only fills the gaps", () => {
    const e = normalizeEvent({ id: "x", tokens: { rsvp: "keep-me-please" } });
    expect(e.tokens.rsvp).toBe("keep-me-please");
    expect(e.tokens.album).toBeTruthy();
    expect(e.tokens.album).not.toBe("keep-me-please");
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

describe("customDomain", () => {
  it("defaults to empty for sites that predate it", () => {
    const e = normalizeEvent({ id: "x", name: "t", type: "wedding", eventSite: { enabled: true } });
    expect(e.eventSite.customDomain).toBe("");
  });
  it("keeps and trims a configured domain", () => {
    const e = normalizeEvent({ id: "x", name: "t", type: "wedding", eventSite: { customDomain: "  a.co.il " } });
    expect(e.eventSite.customDomain).toBe("a.co.il");
  });
});

describe("duplicateEvent does not carry day-of state forward", () => {
  it("clears arrived and giftAmount on the copy", () => {
    // Duplicating last year's gala produced a copy where everyone was already
    // checked in and the gift total was already banked.
    const src = {
      id: "e1", name: "גאלה", type: "אירוע עסקי", date: "2027-01-01",
      guests: [
        { id: "g1", name: "א", side: "bride", group: "עבודה", count: 2, arrived: true, arrivedSeats: [0, 1], giftAmount: 500 },
        { id: "g2", name: "ב", side: "groom", group: "עבודה", count: 1, arrived: true },
      ],
      tables: [], seating: {}, constraints: [],
    };
    const copy = duplicateEvent(src);
    expect(copy.guests.every(g => !g.arrived)).toBe(true);
    expect(copy.guests.every(g => g.giftAmount === undefined)).toBe(true);
    // `arrivedSeats` is the per-person form of the same state. Stripping only
    // the boolean left the copy reading "nobody arrived" in the summary while
    // the entrance screen showed two of them already inside.
    expect(copy.guests.every(g => g.arrivedSeats === undefined)).toBe(true);
    // The original is untouched.
    expect(src.guests[0].arrived).toBe(true);
  });
});

// ── Revoking a public link ───────────────────────────────────────────────────
// The shared-table token is a FULL grant — whoever holds the link can read
// every phone number, edit, delete and export — and until now it could never be
// taken back. One forward to the wrong WhatsApp group was permanent.
describe("rotateEventToken", () => {
  const ev = () => normalizeEvent({
    id: "e1", name: "החתונה", type: "חתונה", date: "2027-06-01",
    guests: [], tables: [], seating: {}, constraints: [],
  });

  it("replaces the named token and leaves every other one alone", () => {
    const before = ev();
    const after  = rotateEventToken(before, "collab", 5_000);
    expect(after.tokens.collab).not.toBe(before.tokens.collab);
    expect(after.tokens.collab).toBeTruthy();
    for (const k of ["rsvp", "invite", "gift", "hostess", "album"]) {
      expect(after.tokens[k]).toBe(before.tokens[k]);
    }
  });

  it("stamps when it happened, because the merge needs to know", () => {
    expect(rotateEventToken(ev(), "collab", 5_000).tokensRotatedAt).toBe(5_000);
  });

  it("does not mutate the event it was given", () => {
    const before = ev();
    const token  = before.tokens.collab;
    rotateEventToken(before, "collab", 5_000);
    expect(before.tokens.collab).toBe(token);
    expect(before.tokensRotatedAt).toBeNull();
  });

  it("refuses a key that is not a public page", () => {
    const before = ev();
    for (const bad of ["password", "", null, undefined, "__proto__"]) {
      expect(rotateEventToken(before, bad, 5_000)).toBe(before);
    }
  });

  it("survives normalizeEvent, which is the only way it reaches storage", () => {
    const rotated = rotateEventToken(ev(), "collab", 5_000);
    const n = normalizeEvent(rotated);
    expect(n.tokens.collab).toBe(rotated.tokens.collab);
    expect(n.tokensRotatedAt).toBe(5_000);
  });
});
