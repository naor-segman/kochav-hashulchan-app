import { describe, it, expect } from "vitest";
import {
  seatsOf, arrivedSeatsOf, arrivedCountOf, isFullyArrived, withArrivedSeats,
  setRowArrived, toggleSeat, setArrivedCount, arrivalTotals, matchGuest,
  searchGuests, tableAvailability, norm, seatChipLabels,
} from "./arrival.js";
import { seatingTotals, guestSeatNames, normalizeEvent } from "./eventHelpers.js";
import { mapLocalEventToCloudPayload, mapCloudEventToLocalEvent } from "./cloudSync.js";

const aunt = {
  id: "g1", name: "דודה רחל", count: 5, rsvp: "confirmed",
  companions: ["משה", "יעל", "איתי"], phone: "050-1234567",
};

describe("legacy data keeps working", () => {
  it("arrived:true still means the whole party", () => {
    expect(arrivedSeatsOf({ ...aunt, arrived: true })).toEqual([0, 1, 2, 3, 4]);
    expect(arrivedCountOf({ ...aunt, arrived: true })).toBe(5);
    expect(isFullyArrived({ ...aunt, arrived: true })).toBe(true);
  });

  it("no arrival field at all means nobody", () => {
    expect(arrivedCountOf(aunt)).toBe(0);
  });

  it("arrivedSeats wins over the legacy boolean once it exists", () => {
    expect(arrivedCountOf({ ...aunt, arrived: true, arrivedSeats: [0, 1] })).toBe(2);
  });
});

describe("the bug the owner reported: one tap marked five people", () => {
  it("marks the aunt and her husband, leaving the children out", () => {
    const g = withArrivedSeats(aunt, [0, 1]);
    expect(arrivedCountOf(g)).toBe(2);
    expect(isFullyArrived(g)).toBe(false);
    // The row still reads as "arrived" to every legacy consumer.
    expect(g.arrived).toBe(true);
  });

  it("the children can be added later without re-marking the parents", () => {
    let g = withArrivedSeats(aunt, [0, 1]);
    g = toggleSeat(g, 2);
    g = toggleSeat(g, 3);
    expect(arrivedSeatsOf(g)).toEqual([0, 1, 2, 3]);
  });

  it("one tap still marks everyone — the common case at the door", () => {
    const g = setRowArrived(aunt, true);
    expect(arrivedCountOf(g)).toBe(5);
    expect(g.arrived).toBe(true);
  });

  it("un-marking the row clears the legacy boolean too", () => {
    const g = setRowArrived(setRowArrived(aunt, true), false);
    expect(g.arrivedSeats).toEqual([]);
    expect(g.arrived).toBe(false);
  });

  it("someone marked they were coming and did not: partial stays partial", () => {
    const g = setArrivedCount(aunt, 2);
    expect(arrivedSeatsOf(g)).toEqual([0, 1]);
  });
});

describe("nothing can push a row past its own seat count", () => {
  it("clamps out-of-range, duplicate and junk indices", () => {
    const g = withArrivedSeats(aunt, [0, 0, 4, 9, -1, "2", 1.5]);
    expect(g.arrivedSeats).toEqual([0, 2, 4]);
  });

  // Number(null) === 0. Writing the filter as Number(v) meant a null in the
  // array silently marked seat 0 — the person the row is named after.
  it("null, undefined, false and '' do NOT become seat 0", () => {
    expect(withArrivedSeats(aunt, [null]).arrivedSeats).toEqual([]);
    expect(withArrivedSeats(aunt, [undefined]).arrivedSeats).toEqual([]);
    expect(withArrivedSeats(aunt, [false]).arrivedSeats).toEqual([]);
    expect(withArrivedSeats(aunt, [""]).arrivedSeats).toEqual([]);
    expect(withArrivedSeats(aunt, [[]]).arrivedSeats).toEqual([]);
    expect(arrivedSeatsOf({ ...aunt, arrivedSeats: [null, ""] })).toEqual([]);
  });

  it("a row whose count shrank after check-in reports only real seats", () => {
    const g = { ...aunt, count: 2, arrivedSeats: [0, 1, 2, 3, 4] };
    expect(arrivedCountOf(g)).toBe(2);
  });

  it("setArrivedCount saturates instead of overflowing", () => {
    expect(arrivedCountOf(setArrivedCount(aunt, 99))).toBe(5);
    expect(arrivedCountOf(setArrivedCount(aunt, -3))).toBe(0);
  });

  it("seatsOf never returns 0", () => {
    expect(seatsOf({ count: 0 })).toBe(1);
    expect(seatsOf({})).toBe(1);
    expect(seatsOf(null)).toBe(1);
  });
});

describe("the counter counts SEATS, and agrees with seatingTotals", () => {
  const guests = [
    { id: "a", name: "טל", count: 4, rsvp: "confirmed", arrivedSeats: [0, 1] },
    { id: "b", name: "רון", count: 1, rsvp: "confirmed", arrived: true },
    { id: "c", name: "שרה", count: 3, rsvp: "confirmed" },
    // Declined guests are out of BOTH sides, exactly as seatingTotals does it.
    { id: "d", name: "אבי", count: 6, rsvp: "declined", arrived: true },
  ];
  const seating = { a: "t1", b: "t1", c: "t2" };

  it("denominator is the same number the seating screen shows", () => {
    const t = arrivalTotals(guests, seating);
    expect(t.totalSeats).toBe(seatingTotals(guests, seating).totalSeats);
    expect(t.totalSeats).toBe(8);
  });

  it("numerator is people, not rows", () => {
    const t = arrivalTotals(guests, seating);
    expect(t.arrivedSeats).toBe(3);   // 2 of טל's party + רון
    expect(t.arrivedRecords).toBe(2); // the old, wrong number
    expect(t.partialRecords).toBe(1);
    expect(t.pct).toBe(38);
  });

  it("a declined guest marked arrived cannot push it over 100%", () => {
    const t = arrivalTotals(guests, seating);
    expect(t.pct).toBeLessThanOrEqual(100);
  });

  it("survives an empty event", () => {
    expect(arrivalTotals(undefined, undefined)).toMatchObject({
      arrivedSeats: 0, totalSeats: 0, pct: 0,
    });
  });
});

describe("search finds the person actually standing at the door", () => {
  it("finds a row by a companion's name and points at that companion's seat", () => {
    const m = matchGuest(aunt, "יעל");
    expect(m).toMatchObject({ via: "companion", label: "יעל", seat: 2 });
    expect(guestSeatNames(aunt)[2]).toBe("יעל (דודה רחל)");
  });

  it("still finds the row by its own name", () => {
    expect(matchGuest(aunt, "רחל")).toMatchObject({ via: "name", seat: 0 });
  });

  it("finds by phone digits, ignoring dashes", () => {
    expect(matchGuest(aunt, "0501234567")).toMatchObject({ via: "phone" });
  });

  it("an empty query matches nothing — not everything", () => {
    expect(matchGuest(aunt, "")).toBeNull();
    expect(matchGuest({ ...aunt, phone: "0501234567" }, "   ")).toBeNull();
  });

  it("ignores niqqud and stray whitespace", () => {
    expect(norm("  דּוֹדָה   רָחֵל ")).toBe("דודה רחל");
    expect(matchGuest(aunt, " רחל ")).not.toBeNull();
  });

  // Someone who said no and turned up anyway must be findable — but must never
  // move the door counter, which is the number the host gives the caterer.
  it("a declined guest is found, flagged, and sorted last", () => {
    const res = searchGuests(
      [{ ...aunt, rsvp: "declined" }, { id: "g2", name: "רחלי", count: 1, rsvp: "confirmed" }],
      "רחל",
    );
    expect(res.map(r => r.guest.id)).toEqual(["g2", "g1"]);
    expect(res[1].declined).toBe(true);
  });

  it("finding a declined guest cannot push the counter past its total", () => {
    const guests = [{ ...aunt, rsvp: "declined", arrivedSeats: [0, 1, 2, 3, 4] }];
    expect(arrivalTotals(guests, {})).toMatchObject({ arrivedSeats: 0, totalSeats: 0, pct: 0 });
  });

  it("does NOT surface a row through a companion who has no seat on it", () => {
    // The row has 2 seats, so only the first companion is on it. The stored
    // list may legitimately be longer — lowering the seat count no longer
    // deletes names — and it used to clamp the index instead of rejecting the
    // match: the row claimed it was found through "ד" and then offered no chip
    // by that name, so "כולם הגיעו" on it marked the wrong family.
    const g = { id: "x", name: "א", count: 2, companions: ["ב", "ג", "ד"] };
    expect(matchGuest(g, "ב")).toEqual({ via: "companion", label: "ב", seat: 1 });
    expect(matchGuest(g, "ג")).toBeNull();
    expect(matchGuest(g, "ד")).toBeNull();
  });

  it("counts seats past the blanks, like guestSeatNames does", () => {
    const g = { id: "x", name: "א", count: 3, companions: ["", "מיה", "רון"] };
    // guestSeatNames drops the blank, so מיה is seat 1 and רון is seat 2.
    expect(matchGuest(g, "מיה").seat).toBe(1);
    expect(matchGuest(g, "רון").seat).toBe(2);
  });
});

describe("walk-in: which tables have room right now", () => {
  const tables = [
    { id: "t1", name: "שולחן 1", capacity: 10 },
    { id: "t2", name: "שולחן 2", capacity: 8 },
    { id: "t3", name: "שולחן 3", capacity: 6 },
  ];
  const guests = [
    { id: "a", count: 4, rsvp: "confirmed" },
    { id: "b", count: 5, rsvp: "confirmed" },
    { id: "c", count: 8, rsvp: "declined" },   // holds no chair
  ];
  const seating = { a: "t1", b: "t2", c: "t3" };

  it("counts seats, not rows, and ignores declined guests", () => {
    const av = tableAvailability(tables, guests, seating);
    const by = Object.fromEntries(av.map(r => [r.table.id, r]));
    expect(by.t1).toMatchObject({ taken: 4, free: 6 });
    expect(by.t2).toMatchObject({ taken: 5, free: 3 });
    expect(by.t3).toMatchObject({ taken: 0, free: 6 });
  });

  it("puts the emptiest table first", () => {
    expect(tableAvailability(tables, guests, seating)[0].free).toBe(6);
  });

  it("an overbooked table reports 0 free, never negative", () => {
    const av = tableAvailability([{ id: "t1", capacity: 2 }], [{ id: "a", count: 9 }], { a: "t1" });
    expect(av[0].free).toBe(0);
  });
});

// ── The bug class this repo produces most: a field written locally that does
// not survive the cloud round-trip. Drive the REAL four stages.
describe("arrivedSeats survives local → normalize → cloud → back", () => {
  const local = {
    id: "e1", name: "אירוע", type: "חתונה",
    guests: [
      { id: "g1", name: "דודה רחל", count: 5, rsvp: "confirmed",
        companions: ["משה", "יעל", "איתי"], arrived: true, arrivedSeats: [0, 1] },
      { id: "g2", name: "רון", count: 1, rsvp: "confirmed", arrived: false, arrivedSeats: [] },
    ],
    tables: [{ id: "t1", name: "שולחן 1", capacity: 10 }],
    seating: { g1: "t1" },
  };

  it("comes back byte-identical on both rows", () => {
    const out = normalizeEvent(
      mapCloudEventToLocalEvent({
        id: "cloud-1", version: 1, created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...mapLocalEventToCloudPayload(normalizeEvent(local), "u1"),
      }),
    );
    expect(out.guests[0].arrivedSeats).toEqual([0, 1]);
    expect(out.guests[0].arrived).toBe(true);
    expect(out.guests[0].companions).toEqual(["משה", "יעל", "איתי"]);
    expect(out.guests[1].arrivedSeats).toEqual([]);
    expect(arrivedCountOf(out.guests[0])).toBe(2);
  });
});

// ── The stepper keeps the people who are already here ────────────────────────
describe("setArrivedCount preserves identities, not just the count", () => {
  const g = (over = {}) => ({ id: "x", name: "דודה רחל", count: 5,
    companions: ["משה", "יעל", "איתי", "נועה"], ...over });

  it("keeps whoever is marked and adds the lowest free seats", () => {
    // Measured before the fix: ticking seat 4 and pressing "+" gave [0,1] —
    // נועה marked absent, two people who are not there marked present.
    expect(setArrivedCount(g({ arrivedSeats: [4] }), 2).arrivedSeats).toEqual([0, 4]);
    expect(setArrivedCount(g({ arrivedSeats: [4] }), 3).arrivedSeats).toEqual([0, 1, 4]);
  });

  it("removes the highest-numbered seats when the count comes down", () => {
    expect(setArrivedCount(g({ arrivedSeats: [0, 2, 4] }), 2).arrivedSeats).toEqual([0, 2]);
    expect(setArrivedCount(g({ arrivedSeats: [0, 2, 4] }), 1).arrivedSeats).toEqual([0]);
  });

  it("is a no-op at the same count", () => {
    expect(setArrivedCount(g({ arrivedSeats: [1, 3] }), 2).arrivedSeats).toEqual([1, 3]);
  });

  it("still fills from seat 0 for a row nobody has marked", () => {
    expect(setArrivedCount(g(), 3).arrivedSeats).toEqual([0, 1, 2]);
  });

  it("clamps to the row and drops junk indices", () => {
    expect(setArrivedCount(g({ arrivedSeats: [0, 9, -1, 2.5] }), 99).arrivedSeats)
      .toEqual([0, 1, 2, 3, 4]);
    expect(setArrivedCount(g({ arrivedSeats: [3] }), 0).arrivedSeats).toEqual([]);
    expect(setArrivedCount(g({ arrivedSeats: [3] }), 0).arrived).toBe(false);
  });
});

// ── The stamp (12.8) ─────────────────────────────────────────────────────────
// Without it the cloud merge is back to asking "has the local copy said
// anything", which cannot tell a local opinion from a value it copied from the
// cloud — and a family arriving in two cars loses the second one.
describe("every arrival write carries the moment it happened", () => {
  const g = { id: "g1", name: "משפחת לוי", count: 4 };

  it("withArrivedSeats stamps arrivedAt", () => {
    expect(withArrivedSeats(g, [0], 1234).arrivedAt).toBe(1234);
  });

  it("un-marking is stamped too — it is an edit, not an absence of one", () => {
    // Whoever un-marked last must win, so [] needs a time like anything else.
    expect(withArrivedSeats(g, [], 1234)).toMatchObject({
      arrivedSeats: [], arrived: false, arrivedAt: 1234,
    });
  });

  it("the stamp reaches every caller, not just the direct one", () => {
    expect(setRowArrived(g, true).arrivedAt).toEqual(expect.any(Number));
    expect(toggleSeat(g, 1).arrivedAt).toEqual(expect.any(Number));
    expect(setArrivedCount(g, 2).arrivedAt).toEqual(expect.any(Number));
  });

  it("defaults to now when no clock is passed", () => {
    const before = Date.now();
    const out = withArrivedSeats(g, [0]);
    expect(out.arrivedAt).toBeGreaterThanOrEqual(before);
    expect(out.arrivedAt).toBeLessThanOrEqual(Date.now());
  });
});

// seatChipLabels had zero tests — it is imported only by EntranceScreen — and a
// one-character mutant (comps[i-1] → comps[i]) survived the whole suite. That
// mutant is not cosmetic: matchGuest returns seat i+1 for companion i, so the
// chips and the search would disagree and the greeter tapping "seat 1" would
// check in a different person from the one they are looking at.
describe("seatChipLabels — the chips the greeter taps at the door", () => {
  it("puts the main guest first and each companion at its own seat", () => {
    expect(seatChipLabels({ name: "טל שוורץ", count: 3, companions: ["רון", "מיה"] }))
      .toEqual(["טל שוורץ", "רון", "מיה"]);
  });

  // The contract that makes the chips and the search agree.
  it("puts companion i at index i+1, which is the seat matchGuest returns", () => {
    const g = { id: "g1", name: "טל", count: 4, companions: ["רון", "מיה", "דן"] };
    const labels = seatChipLabels(g);
    g.companions.forEach((name, i) => expect(labels[i + 1]).toBe(name));
  });

  it("fills unnamed seats with a numbered placeholder rather than a blank chip", () => {
    expect(seatChipLabels({ name: "משפחת כהן", count: 3, companions: [] }))
      .toEqual(["משפחת כהן", "אורח 2", "אורח 3"]);
    expect(seatChipLabels({ name: "משפחת כהן", count: 3, companions: ["רון"] }))
      .toEqual(["משפחת כהן", "רון", "אורח 3"]);
  });

  it("never renders a nameless main guest as an empty chip", () => {
    expect(seatChipLabels({ name: "", count: 2, companions: ["רון"] }))
      .toEqual(["אורח", "רון"]);
  });

  it("returns exactly as many chips as the row has seats", () => {
    for (const count of [1, 2, 5, 12]) {
      expect(seatChipLabels({ name: "א", count, companions: ["x", "y"] })).toHaveLength(count);
    }
  });
});

// arrivedSeatsOf drops its sort and the suite stayed green — but the chips are
// rendered in this order, so a greeter who checks in seat 2 before seat 1 sees
// the names swap around under their finger.
describe("arrivedSeatsOf returns seats in seat order, whatever order they were marked in", () => {
  it("sorts marks made out of order", () => {
    expect(arrivedSeatsOf({ count: 4, arrivedSeats: [2, 0, 3] })).toEqual([0, 2, 3]);
    expect(arrivedSeatsOf({ count: 3, arrivedSeats: [1, 0] })).toEqual([0, 1]);
  });

  it("still de-duplicates and drops seats past the row's size", () => {
    expect(arrivedSeatsOf({ count: 2, arrivedSeats: [1, 1, 0, 7] })).toEqual([0, 1]);
  });
});
