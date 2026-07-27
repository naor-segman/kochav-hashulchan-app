import { describe, it, expect } from "vitest";
import { eventHealth, dashStats, summaryMessages } from "./eventAnalytics.js";

const g = (id, extra = {}) => ({ id, name: id, side: "bride", group: "משפחה", count: 1, rsvp: "pending", ...extra });
const t = (id, capacity) => ({ id, name: id, capacity });

const baseEvent = (over = {}) => ({
  name: "חתונה", guests: [], tables: [], seating: {}, constraints: [], ...over,
});

const keys = ev => eventHealth(ev).indicators.map(i => i.key);

describe("eventHealth — declined guests", () => {
  it("does not leave an event stuck on 'מקומות ממתינים' when a guest declined", () => {
    const ev = baseEvent({
      guests:  [g("a"), g("b"), g("gone", { rsvp: "declined" })],
      tables:  [t("t1", 10)],
      seating: { a: "t1", b: "t1" },
    });
    const h = eventHealth(ev);
    expect(h.unassigned).toBe(0);
    expect(keys(ev)).toContain("complete");
    expect(keys(ev)).not.toContain("unassigned");
    expect(h.needsAttention).toBe(false);
  });

  it("excludes declined seats from the totals on both sides", () => {
    const ev = baseEvent({
      guests:  [g("a", { count: 4 }), g("gone", { count: 5, rsvp: "declined" })],
      tables:  [t("t1", 10)],
      seating: { a: "t1" },
    });
    const h = eventHealth(ev);
    expect(h.totalSeats).toBe(4);
    expect(h.seatedSeats).toBe(4);
    expect(h.pct).toBe(1);
  });

  it("still reports 'אין אורחים' only when there are none at all", () => {
    expect(keys(baseEvent({ tables: [t("t1", 10)] }))).toContain("no_guests");
    // all declined is not the same as none invited
    const allDeclined = baseEvent({
      guests: [g("x", { rsvp: "declined" })],
      tables: [t("t1", 10)],
    });
    expect(keys(allDeclined)).not.toContain("no_guests");
  });
});

describe("eventHealth — setup indicators", () => {
  it("flags a missing name, missing tables and missing guests", () => {
    const k = keys({ guests: [], tables: [], seating: {}, constraints: [] });
    expect(k).toEqual(expect.arrayContaining(["no_name", "no_tables", "no_guests"]));
    expect(eventHealth({ guests: [], tables: [] }).needsAttention).toBe(true);
  });

  it("flags an event with guests but no seating at all", () => {
    const ev = baseEvent({ guests: [g("a"), g("b")], tables: [t("t1", 10)] });
    expect(keys(ev)).toContain("not_seated");
    expect(keys(ev)).not.toContain("unassigned");
  });

  it("reports the number of waiting seats when partially seated", () => {
    const ev = baseEvent({
      guests:  [g("a", { count: 2 }), g("b", { count: 3 })],
      tables:  [t("t1", 10)],
      seating: { a: "t1" },
    });
    const h = eventHealth(ev);
    expect(h.unassigned).toBe(3);
    expect(h.indicators.find(i => i.key === "unassigned").label).toContain("3");
  });

  it("surfaces constraint violations", () => {
    const ev = baseEvent({
      guests:      [g("a"), g("b")],
      tables:      [t("t1", 10)],
      seating:     { a: "t1", b: "t1" },
      constraints: [{ id: "c1", type: "apart", guestA: "a", guestB: "b" }],
    });
    const h = eventHealth(ev);
    expect(h.viols).toBe(1);
    expect(keys(ev)).toContain("violations");
    expect(keys(ev)).not.toContain("complete");
  });

  it("pct is 0 rather than NaN for an empty event", () => {
    expect(eventHealth({ guests: [], tables: [] }).pct).toBe(0);
  });
});

describe("dashStats", () => {
  const ready = baseEvent({
    guests: [g("a")], tables: [t("t1", 10)], seating: { a: "t1" },
  });
  const needy = baseEvent({ guests: [g("b")], tables: [t("t1", 10)] });

  it("aggregates seats and splits ready vs needs-attention", () => {
    const s = dashStats([ready, needy]);
    expect(s.totalEvents).toBe(2);
    expect(s.totalGuests).toBe(2);
    expect(s.seatedGuests).toBe(1);
    expect(s.seatedPct).toBe(50);
    expect(s.readyToPrint).toBe(1);
    expect(s.needAttention).toBe(1);
  });

  it("does not divide by zero with no events", () => {
    expect(dashStats([])).toMatchObject({ totalEvents: 0, seatedPct: 0, totalGuests: 0 });
  });
});

describe("summaryMessages", () => {
  it("uses singular wording for exactly one event", () => {
    const msgs = summaryMessages({ needAttention: 1, readyToPrint: 1, totalGuests: 5, seatedGuests: 5 });
    expect(msgs.map(m => m.text)).toEqual([
      "אירוע אחד דורש טיפול",
      "אירוע אחד מוכן להדפסה",
    ]);
  });

  it("uses plural wording and reports unseated seats", () => {
    const msgs = summaryMessages({ needAttention: 3, readyToPrint: 0, totalGuests: 10, seatedGuests: 4 });
    expect(msgs[0].text).toBe("3 אירועים דורשים טיפול");
    expect(msgs.at(-1).text).toContain("6");
  });

  it("says nothing when everything is done", () => {
    expect(summaryMessages({ needAttention: 0, readyToPrint: 0, totalGuests: 4, seatedGuests: 4 })).toEqual([]);
  });
});
