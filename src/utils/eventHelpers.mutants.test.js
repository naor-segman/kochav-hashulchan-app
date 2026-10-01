import { describe, it, expect } from "vitest";
import {
  normalizeDeletedRows, normalizeEvent, duplicateEvent, getSideLabels, normalizeRotations,
  TOMBSTONE_TTL_MS,
} from "./eventHelpers.js";

// Seven edits to eventHelpers.js passed the entire suite in the third-review
// mutation run (29.9). normalizeEvent is the single migration gateway for every
// localStorage round-trip AND every cloud pull, so a default that drifts here
// drifts for every event on every device at once. Each test names the host-
// visible consequence of the edit it guards.

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);

describe("tombstones: how long a delete is remembered", () => {
  // A tombstone has to outlive the slowest device that still holds the deleted
  // row. A phone left in a drawer for three months after the save-the-dates
  // went out is ordinary; if its tombstones had expired after 30 days, the
  // laptop's deletes are forgotten and the phone's stale copy resurrects every
  // guest and table the host removed in the meantime.
  it("a 100-day-old delete is still honoured", () => {
    const out = normalizeDeletedRows({ guests: { g1: NOW - 100 * DAY } }, NOW);
    expect(out).toEqual({ guests: { g1: NOW - 100 * DAY } });
  });
  it("the TTL is half a year", () => {
    expect(TOMBSTONE_TTL_MS).toBe(180 * DAY);
    expect(normalizeDeletedRows({ guests: { g1: NOW - 181 * DAY } }, NOW)).toEqual({});
  });

  // A stamp that is not a finite number can never age out — `now - "x"` is
  // NaN and `now - Infinity` is -Infinity, both of which pass "younger than the
  // TTL" forever. Kept, they ride in every payload for the life of the account.
  it("non-finite stamps are dropped, not kept forever", () => {
    const out = normalizeDeletedRows({
      guests: { a: "yesterday", b: NaN, c: Infinity, d: null, ok: NOW - DAY },
    }, NOW);
    expect(out).toEqual({ guests: { ok: NOW - DAY } });
  });
});

describe("normalizeEvent: the entrance link's write switch defaults OPEN", () => {
  // `hostess_writes_active(e)` in SQL treats a missing flag as open. If the
  // client treated it as closed, every event that predates the switch would
  // show the host "סגור" while the greeter's link still writes — the screen and
  // the server disagreeing about whether the door is open, at the door.
  it("absent → true; only an explicit false closes it", () => {
    expect(normalizeEvent({ id: "e1" }).hostessWriteActive).toBe(true);
    expect(normalizeEvent({ id: "e1", hostessWriteActive: undefined }).hostessWriteActive).toBe(true);
    expect(normalizeEvent({ id: "e1", hostessWriteActive: false }).hostessWriteActive).toBe(false);
  });
});

describe("normalizeEventSite: the host's section switches beat the type's defaults", () => {
  // The host turned the gift section off on their wedding site. Spreading the
  // defaults AFTER the host's choices put it back on at the next load — and a
  // guest-facing page is the one place a host cannot see the regression until a
  // guest mentions it.
  it("sections: { gift: false } stays false; unspecified sections take the default", () => {
    const out = normalizeEvent({ id: "e1", type: "חתונה", eventSite: { sections: { gift: false } } });
    expect(out.eventSite.sections.gift).toBe(false);
    expect(out.eventSite.sections.schedule).toBe(true);
  });
});

describe("duplicateEvent: floor-plan positions only for tables that exist", () => {
  // A stale position for a table that was deleted from the source event has no
  // entry in tableIdMap. Mapping it anyway wrote it under the key "undefined" —
  // a position for a table called undefined, carried into every copy of the
  // copy and synced to the cloud.
  it("no 'undefined' key; the real table keeps its position under its NEW id", () => {
    const src = {
      id: "e1", name: "גאלה", tables: [{ id: "t1", name: "1", capacity: 10 }], guests: [], constraints: [],
      seating: {}, floorPlan: { image: null, tablePositions: { t1: { x: 1, y: 2 }, tGONE: { x: 9, y: 9 } }, elements: [] },
    };
    const copy = duplicateEvent(src);
    const keys = Object.keys(copy.floorPlan.tablePositions);
    expect(keys).not.toContain("undefined");
    expect(keys).toEqual([copy.tables[0].id]);
    expect(copy.floorPlan.tablePositions[copy.tables[0].id]).toEqual({ x: 1, y: 2 });
  });
});

describe("getSideLabels: a henna is a wedding-shaped event", () => {
  // חינה stores the couple's names exactly like חתונה and אירוס, and the setup
  // screen asks for them the same way (getEventPersonalConfig groups the three).
  // Dropping it from this branch printed "צד א׳ / צד ב׳" on the seating screen
  // and the Excel export of a henna whose host had typed both names.
  it("חינה with names → 'צד <name>'", () => {
    expect(getSideLabels({ type: "חינה", brideName: "דנה", groomName: "יוסי" }))
      .toEqual({ bride: "צד דנה", groom: "צד יוסי" });
  });
  it("חינה without names → the couple role words, not the generic fallback", () => {
    expect(getSideLabels({ type: "חינה" })).toEqual({ bride: "צד כלה", groom: "צד חתן" });
  });
});

describe("normalizeRotations: only known link kinds", () => {
  // The per-link rotation map is compared key by key in the merge. A key that
  // is not a link (junk from an older build, a typo in a hand-edited payload)
  // is never read and never expires — it just rides in every sync.
  it("unknown keys are dropped", () => {
    expect(normalizeRotations({ rsvp: 5, bogus: 6, __proto_x: 7 })).toEqual({ rsvp: 5 });
  });
});
