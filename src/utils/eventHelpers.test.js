import { describe, it, expect } from "vitest";
import { normalizeEvent, duplicateEvent, seatingTotals, TOKEN_KEYS, rotateEventToken,
         guestSeatNames, guestCompanionNames,
         getSideLabels, getEventPersonalConfig, getEventNamePlaceholder,
         PARENT_TYPES, PARENT_EVENT_TYPES } from "./eventHelpers.js";
import { EVENT_TYPES } from "../data/constants.js";
import { defaultEventSite } from "../data/eventSiteTemplates.js";
import { normalizeAnnouncements } from "../data/announcementTemplates.js";
import { starterTasks } from "../data/taskTemplates.js";

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

describe("guestCompanionNames — the on-screen companions line", () => {
  const guest = (extra = {}) => ({ id: "g1", name: "טל שוורץ", count: 2, ...extra });

  it("drops the parenthetical guestSeatNames adds for the printed card", () => {
    const g = guest({ companions: ["רונית"] });
    // What the place card needs — the name is meaningful alone on a plate.
    expect(guestSeatNames(g)).toEqual(["טל שוורץ", "רונית (טל שוורץ)"]);
    // What the table card needs — "טל שוורץ" is already the line above.
    expect(guestCompanionNames(g)).toEqual(["רונית"]);
  });

  it("returns nothing when the extra seats have no names on them", () => {
    // guestSeatNames pads these with "טל שוורץ +1", i.e. the row's own name
    // for a third time. There is nothing to show, so nothing is shown.
    expect(guestSeatNames(guest({ count: 3 }))).toEqual(["טל שוורץ", "טל שוורץ +1", "טל שוורץ +2"]);
    expect(guestCompanionNames(guest({ count: 3 }))).toEqual([]);
  });

  it("clamps to the seats the row actually has, like the shared table does", () => {
    // A stale companions array longer than the count must not print people
    // who have no chair.
    const g = guest({ count: 2, companions: ["רונית", "יעל", "אבי"] });
    expect(guestCompanionNames(g)).toEqual(["רונית"]);
  });

  it("skips blank and whitespace-only companions, and trims the rest", () => {
    const g = guest({ count: 4, companions: ["  רונית  ", "", "   ", "יעל"] });
    expect(guestCompanionNames(g)).toEqual(["רונית", "יעל"]);
  });

  it("is safe on a row that predates companions, and on no row at all", () => {
    expect(guestCompanionNames({ id: "g", name: "טל", count: 2 })).toEqual([]);
    expect(guestCompanionNames({ id: "g", name: "טל", count: 2, companions: "רונית" })).toEqual([]);
    expect(guestCompanionNames(null)).toEqual([]);
    expect(guestCompanionNames(undefined)).toEqual([]);
  });

  it("returns nothing for a single-seat row even if a companion was left behind", () => {
    expect(guestCompanionNames(guest({ count: 1, companions: ["רונית"] }))).toEqual([]);
  });
});

// ── From the 12.8 logic review ───────────────────────────────────────────────
describe("guestSeatNames never prints more names than the row has seats", () => {
  it("clamps a stale companions array to count", () => {
    // The shared table and RSVP can both leave `companions` longer than `count`
    // after someone lowers the number of chairs, and this function feeds the
    // printed place cards — uncapped it would print a card for a person with
    // no seat.
    //
    // The review reported the trailing `.slice(0, count)` as an untested guard
    // and gave this exact row as a case where removing it yields four names.
    // It does not: executed both ways, the `names.length < count` guard inside
    // the loop already caps it, and the two agree on every integer count. The
    // slice only bites on a FRACTIONAL count (2.5 → 3 names without it), which
    // no writer produces. So this test pins the behaviour; it does not kill a
    // mutant, because there is no reachable mutant to kill.
    const row = { name: "טל שוורץ", count: 2, companions: ["רונית", "דנה", "גיל"] };
    expect(guestSeatNames(row)).toEqual(["טל שוורץ", "רונית (טל שוורץ)"]);
    expect(guestSeatNames(row)).toHaveLength(2);
  });

  it("still pads unnamed seats up to count", () => {
    expect(guestSeatNames({ name: "משפחת לוי", count: 3, companions: [] }))
      .toEqual(["משפחת לוי", "משפחת לוי +1", "משפחת לוי +2"]);
  });
});

describe("duplicateEvent leaves the previous event's commitments behind", () => {
  const ev = () => ({
    id: "e1", name: "גאלה 2025", guests: [], tables: [], constraints: [], seating: {},
    vendors: [
      { id: "v1", name: "DJ", category: "music", status: "booked", price: "9000", paid: "9000", payment: "paid" },
      { id: "v2", name: "צלם", category: "photographer", status: "quoted", price: "4000", paid: "1000", payment: "deposit" },
    ],
    announcements: { save: { headline: "שמרו את התאריך" } },
    messageTemplates: { invitation: "היי" },
  });

  it("keeps the vendor and the agreed price, drops the booking and the payment", () => {
    // The same defect as copying `arrived`: state that belongs to the event
    // that actually happened. Duplicating last year's gala handed you a copy
    // where the DJ was already booked and ₪9,000 already paid.
    const dup = duplicateEvent(ev());
    expect(dup.vendors).toHaveLength(2);
    expect(dup.vendors[0]).toMatchObject({ name: "DJ", price: "9000", status: "lead", paid: "", payment: "none" });
    expect(dup.vendors[1]).toMatchObject({ name: "צלם", price: "4000", status: "lead", paid: "", payment: "none" });
  });

  it("gives every vendor a fresh id and does not share arrays or objects", () => {
    const original = ev();
    const dup = duplicateEvent(original);
    expect(dup.vendors.map(v => v.id)).not.toContain("v1");
    expect(dup.vendors).not.toBe(original.vendors);
    expect(dup.vendors[0]).not.toBe(original.vendors[0]);
    // The function's own comment claims the remaining nested collections are
    // deep-copied. These two were not.
    expect(dup.announcements).not.toBe(original.announcements);
    expect(dup.messageTemplates).not.toBe(original.messageTemplates);
    dup.announcements.save.headline = "שונה";
    expect(original.announcements.save.headline).toBe("שמרו את התאריך");
  });

  it("survives an event with no vendors at all", () => {
    const { vendors, ...noVendors } = ev();   // eslint-disable-line no-unused-vars
    expect(duplicateEvent(noVendors).vendors).toEqual([]);
  });
});

// ── ברית / בריתה (added 12.8, at the owner's request) ────────────────────────
// The picker offered neither, so a host planning one had to pick "אחר" and lose
// every piece of wording the product would otherwise get right — while the
// app's own grammar table already listed both words. Adding a type is only real
// if every map keyed on type answers for it; these check the ones that fall
// back SILENTLY rather than failing, which is what made the gap invisible.
describe("ברית and בריתה are real event types, not 'אחר'", () => {
  const OTHER = "אחר";

  it.each(["ברית", "בריתה"])("%s is selectable at all", (type) => {
    expect(EVENT_TYPES).toContain(type);
  });

  it.each(["ברית", "בריתה"])("%s names the two families, not צד א׳/צד ב׳", (type) => {
    expect(getSideLabels({ type })).toEqual({ bride: "משפחת האם", groom: "משפחת האב" });
  });

  // Was "asks for the baby's name, in the right gender", pinning label "שם
  // התינוק" / "שם התינוקת". That is a question the host cannot answer: a brit
  // is booked within days of the birth and the name is not said aloud until the
  // ceremony. The field is the one that titles the event, so it now asks for
  // the thing that is always known.
  it("asks for the family name, not a baby name nobody has announced yet", () => {
    for (const type of ["ברית", "בריתה"]) {
      const cfg = getEventPersonalConfig(type);
      expect(cfg).toMatchObject({ kind: "owner", label: "שם המשפחה" });
      expect(cfg.label).not.toMatch(/תינוק/);
      expect(cfg.divider).not.toMatch(/נולד/);
    }
  });

  it.each(["ברית", "בריתה"])("%s has an event-name example of its own", (type) => {
    expect(getEventNamePlaceholder(type)).not.toBe(getEventNamePlaceholder(OTHER));
  });

  it.each(["ברית", "בריתה"])("%s gets its own event-site hero", (type) => {
    expect(defaultEventSite(type).heroEn).not.toBe(defaultEventSite(OTHER).heroEn);
  });

  it.each(["ברית", "בריתה"])("%s gets its own announcement wording", (type) => {
    expect(JSON.stringify(normalizeAnnouncements(undefined, type)))
      .not.toBe(JSON.stringify(normalizeAnnouncements(undefined, OTHER)));
  });

  it("gets a checklist measured in DAYS, not months", () => {
    // The whole reason "אחר" was not an acceptable answer: every other list
    // opens with "לסגור מקום ותאריך" around 90 days out, for an event that
    // happens on the eighth day.
    const tasks = starterTasks("ברית");
    expect(tasks).not.toEqual(starterTasks(OTHER));
    expect(Math.max(...tasks.map(t => t.offset))).toBeLessThanOrEqual(14);
    expect(tasks.some(t => t.title.includes("מוהל"))).toBe(true);
    expect(starterTasks("בריתה")).toEqual(tasks);
  });
});

// The wording for the two sides of a bar mitzvah / bat mitzvah / brit was
// hard-coded to "משפחת האם" / "משפחת האב". A family with two mothers was told,
// on the first screen of the product, that it had not been expected — and the
// only way out was an optional side-names field further down the same form,
// after the wrong words had already been shown. Weddings had solved exactly
// this with coupleType years of code earlier.
describe("parentsType — the two families are not always a mother and a father", () => {
  it("still says מה שאמר קודם for a family that never touches the picker", () => {
    for (const type of PARENT_EVENT_TYPES) {
      expect(getSideLabels({ type })).toEqual({ bride: "משפחת האם", groom: "משפחת האב" });
    }
  });

  it.each(PARENT_EVENT_TYPES)("%s follows the picker", (type) => {
    expect(getSideLabels({ type, parentsType: "mother-mother" }))
      .toEqual({ bride: "משפחת אמא א׳", groom: "משפחת אמא ב׳" });
    expect(getSideLabels({ type, parentsType: "father-father" }))
      .toEqual({ bride: "משפחת אבא א׳", groom: "משפחת אבא ב׳" });
  });

  // Two sides that read the same are two sides nobody can tell apart in the
  // seating screen, the collab table or the entrance list.
  it.each(PARENT_TYPES.map(p => p.value))("%s gives two distinguishable sides", (value) => {
    const { bride, groom } = getSideLabels({ type: "בר מצווה", parentsType: value });
    expect(bride).toBeTruthy();
    expect(groom).toBeTruthy();
    expect(bride).not.toBe(groom);
  });

  it("a single parent gets one household and its guests, not two households", () => {
    expect(getSideLabels({ type: "ברית", parentsType: "single" }))
      .toEqual({ bride: "משפחה", groom: "חברים" });
  });

  // The whole point of the custom fields is that they win. A host who typed
  // their own words must not have them overwritten by a picker.
  it("never overrides side names the host typed", () => {
    expect(getSideLabels({
      type: "בר מצווה", parentsType: "mother-mother",
      sideLabels: { bride: "משפחת לוי", groom: "משפחת כהן" },
    })).toEqual({ bride: "משפחת לוי", groom: "משפחת כהן" });
  });

  it("ignores a parentsType on an event type that has no parents", () => {
    expect(getSideLabels({ type: "חתונה", parentsType: "mother-mother" }))
      .toEqual({ bride: "צד כלה", groom: "צד חתן" });
    expect(getSideLabels({ type: "אירוע עסקי", parentsType: "father-father" }))
      .toEqual({ bride: "הנהלה", groom: "עובדים" });
  });

  it("falls back rather than rendering nothing for a value it does not know", () => {
    expect(getSideLabels({ type: "ברית", parentsType: "לא קיים" }))
      .toEqual({ bride: "משפחת האם", groom: "משפחת האב" });
  });

  it("normalizeEvent defaults it and preserves it", () => {
    expect(normalizeEvent({ type: "ברית" }).parentsType).toBe("mother-father");
    expect(normalizeEvent({ type: "ברית", parentsType: "father-father" }).parentsType)
      .toBe("father-father");
  });
});
