import { describe, it, expect, beforeAll } from "vitest";
import {
  parseEventDate, addDays, daysBetween, startOfToday,
  eventPhotoUrls, photoRetentionState, postponeToYmd,
  PURGE_AFTER_DAYS, WARN_BEFORE_DAYS,
} from "./photoRetention.js";

// This module decides when to DELETE a customer's photographs. There is no
// undo, no backup of the bucket, and the host is usually not looking. So the
// tests are written against the two failures that actually cost something:
// deleting a day early (or a day late, twice a year, for everyone), and
// missing a photo so the event reports itself purged while the biggest object
// stays on the bill.
//
// THE RUNNER IS IN UTC, AND THAT MAKES THE DATE TESTS VACUOUS.
//
// Every date bug this repo has shipped is invisible at offset zero: local
// midnight and UTC midnight are the same instant, `toISOString().slice(0,10)`
// is the right day, and a fixed-millisecond span never crosses a DST change
// because there isn't one. The first version of this file asserted that
// `parseEventDate` differs from `new Date("2026-06-01")` and FAILED — not
// because the code was wrong, but because in UTC the two are legitimately
// identical. The check was what was broken.
//
// So the process is put in the timezone the customers are in, and the premise
// is asserted rather than assumed: if a future runner ignores TZ, the guard
// below fails loudly instead of letting twenty date assertions quietly stop
// testing anything.
process.env.TZ = "Asia/Jerusalem";

beforeAll(() => {
  expect(
    new Date(2026, 5, 1).getTimezoneOffset(),
    "these tests are meaningless at UTC — TZ did not take effect",
  ).not.toBe(0);
});

const ev = (over = {}) => ({
  date: "2026-06-01",
  eventSite: { coverPhoto: null, gallery: [], ...(over.eventSite || {}) },
  ...over,
});
const URL_A = "https://x.supabase.co/storage/v1/object/public/event-site/e/a.webp";
const URL_B = "https://x.supabase.co/storage/v1/object/public/event-site/e/b.webp";
const URL_C = "https://x.supabase.co/storage/v1/object/public/event-site/e/c.webp";

describe("parseEventDate", () => {
  it("reads a date string as LOCAL midnight, not UTC", () => {
    const d = parseEventDate("2026-06-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(0);
  });

  // `new Date("2026-06-01")` is UTC midnight — 03:00 in Israel, but the
  // PREVIOUS day at any negative offset. This app has shipped that bug.
  it("does not go through the UTC-parsing constructor", () => {
    expect(parseEventDate("2026-06-01").getTime())
      .not.toBe(new Date("2026-06-01").getTime());
  });

  it("rejects what is not a date rather than guessing", () => {
    for (const bad of [null, undefined, "", 42, {}, "01/06/2026", "2026-6-1", "not a date"]) {
      expect(parseEventDate(bad), String(bad)).toBeNull();
    }
  });

  // The Date constructor rolls 2026-02-30 forward to March 2 without
  // complaining, which would schedule a deletion from a date that never was.
  it("rejects a day that does not exist in its month", () => {
    expect(parseEventDate("2026-02-30")).toBeNull();
    expect(parseEventDate("2026-13-01")).toBeNull();
    expect(parseEventDate("2026-02-29")).toBeNull();  // 2026 is not a leap year
    expect(parseEventDate("2028-02-29")).not.toBeNull();
  });
});

describe("calendar arithmetic across the traps", () => {
  it("crosses a month end", () => {
    const d = addDays(parseEventDate("2026-06-01"), 30);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 7, 1]);
  });

  it("crosses a year end", () => {
    const d = addDays(parseEventDate("2026-12-20"), 30);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2027, 1, 19]);
  });

  // THE ONE THAT MATTERS. Israel moves the clock in late March and late
  // October. `date.getTime() + 30 * 86400000` lands an hour off across those,
  // and an hour off before midnight is a WHOLE DAY off on the calendar — so
  // every host with an event near the transition would be warned, and purged,
  // a day early or late. Calendar arithmetic is immune; this pins it.
  it("spans a DST transition without drifting a day", () => {
    for (const start of ["2026-03-10", "2026-03-27", "2026-10-10", "2026-10-25"]) {
      const from = parseEventDate(start);
      const to   = addDays(from, PURGE_AFTER_DAYS);
      expect(daysBetween(from, to), `${start} + ${PURGE_AFTER_DAYS}`).toBe(PURGE_AFTER_DAYS);
      expect(to.getHours(), `${start} lands at local midnight`).toBe(0);
      // And the fixed-millisecond version it replaced is measurably different
      // wherever the offset changed — proof the trap is real here and not
      // theoretical. (Skipped in a UTC-only environment, where it cannot be.)
      const naive = new Date(from.getTime() + PURGE_AFTER_DAYS * 86400000);
      if (naive.getTimezoneOffset() !== from.getTimezoneOffset()) {
        expect(naive.getHours()).not.toBe(0);
      }
    }
  });

  it("counts whole days both ways", () => {
    const a = parseEventDate("2026-06-01");
    expect(daysBetween(a, addDays(a, 7))).toBe(7);
    expect(daysBetween(addDays(a, 7), a)).toBe(-7);
    expect(daysBetween(a, a)).toBe(0);
  });

  it("startOfToday strips the clock", () => {
    const t = startOfToday(new Date(2026, 5, 1, 23, 59, 59));
    expect([t.getHours(), t.getMinutes(), t.getSeconds()]).toEqual([0, 0, 0]);
    expect(t.getDate()).toBe(1);
  });
});

describe("eventPhotoUrls — what gets deleted", () => {
  it("collects the cover, the gallery and the invitation", () => {
    const e = ev({
      eventSite: { coverPhoto: URL_A, gallery: [URL_B] },
      announcements: { saveTheDate: { photo: URL_C } },
    });
    expect(eventPhotoUrls(e).sort()).toEqual([URL_A, URL_B, URL_C].sort());
  });

  // The invitation is the LARGEST object an event holds (1400px, q0.82).
  // Collecting the gallery but not this one would clear the payload, report the
  // event purged, and leave the heaviest file on the bill forever — with the
  // URL now gone, so nothing could ever find it again.
  it("does not forget the invitation photo", () => {
    const e = ev({ announcements: { invitation: { photo: URL_C } } });
    expect(eventPhotoUrls(e)).toContain(URL_C);
  });

  it("ignores legacy base64 photos — there is no object to remove", () => {
    const e = ev({ eventSite: { coverPhoto: "data:image/jpeg;base64,/9j/", gallery: ["data:image/webp;base64,UklGR"] } });
    expect(eventPhotoUrls(e)).toEqual([]);
  });

  it("deduplicates, so the same object is not removed twice", () => {
    const e = ev({ eventSite: { coverPhoto: URL_A, gallery: [URL_A, URL_A] } });
    expect(eventPhotoUrls(e)).toEqual([URL_A]);
  });

  it("survives every shape an event can actually be in", () => {
    for (const bad of [null, undefined, {}, { eventSite: null }, { eventSite: {} },
                       { eventSite: { gallery: null } }, { announcements: null },
                       { announcements: { x: null } }, { announcements: "nope" }]) {
      expect(() => eventPhotoUrls(bad), JSON.stringify(bad)).not.toThrow();
      expect(eventPhotoUrls(bad), JSON.stringify(bad)).toEqual([]);
    }
  });
});

describe("photoRetentionState", () => {
  const withPhotos = (over = {}) => ev({ eventSite: { coverPhoto: URL_A, gallery: [URL_B] }, ...over });
  const on = (ymd) => parseEventDate(ymd);

  it("says nothing to do when the event holds no stored photos", () => {
    expect(photoRetentionState(ev(), on("2027-01-01")).state).toBe("none");
  });

  it("is safe well before the window", () => {
    const r = photoRetentionState(withPhotos(), on("2026-06-10"));
    expect(r.state).toBe("safe");
    expect(r.daysLeft).toBe(21);
  });

  // The boundary in both directions, because "<=" vs "<" here is the difference
  // between warning for 7 days and warning for 6.
  it("opens the warning exactly WARN_BEFORE_DAYS out", () => {
    const eventDay = "2026-06-01";
    const dayBefore = addDays(on(eventDay), PURGE_AFTER_DAYS - WARN_BEFORE_DAYS - 1);
    const first     = addDays(on(eventDay), PURGE_AFTER_DAYS - WARN_BEFORE_DAYS);
    expect(photoRetentionState(withPhotos(), dayBefore).state).toBe("safe");
    const r = photoRetentionState(withPhotos(), first);
    expect(r.state).toBe("warning");
    expect(r.daysLeft).toBe(WARN_BEFORE_DAYS);
  });

  it("counts down through the window and is due on the day", () => {
    expect(photoRetentionState(withPhotos(), on("2026-06-30")).daysLeft).toBe(1);
    expect(photoRetentionState(withPhotos(), on("2026-06-30")).state).toBe("warning");
    expect(photoRetentionState(withPhotos(), on("2026-07-01")).state).toBe("due");
  });

  it("stays due afterwards — a job that missed a day still has work", () => {
    expect(photoRetentionState(withPhotos(), on("2027-07-01")).state).toBe("due");
  });

  // An event with no date is the one case where guessing deletes a real
  // customer's photographs on the strength of a field they never filled in.
  it("never purges an event that has no date", () => {
    const r = photoRetentionState(withPhotos({ date: "" }), on("2030-01-01"));
    expect(r.state).toBe("safe");
    expect(r.purgeOn).toBeNull();
  });

  describe("postponement", () => {
    const kept = (until) => withPhotos({ eventSite: { coverPhoto: URL_A, gallery: [URL_B], photosKeepUntil: until } });

    it("outranks the schedule while it lasts", () => {
      const r = photoRetentionState(kept("2026-09-01"), on("2026-07-15"));
      expect(r.state).toBe("kept");
      expect(r.daysLeft).toBe(48);
    });

    it("lapses, and the event becomes due again", () => {
      expect(photoRetentionState(kept("2026-09-01"), on("2026-09-01")).state).toBe("due");
      expect(photoRetentionState(kept("2026-09-01"), on("2026-09-02")).state).toBe("due");
    });

    // A postponement in the past must not read as "kept forever", and a
    // malformed one must not read as "kept" either — both would silently
    // disable the whole feature for that event.
    it("ignores a postponement it cannot parse", () => {
      expect(photoRetentionState(kept("garbage"), on("2026-07-15")).state).toBe("due");
      expect(photoRetentionState(kept(null),      on("2026-07-15")).state).toBe("due");
    });
  });
});

describe("postponeToYmd", () => {
  it("is another full window from today, not from the event", () => {
    expect(postponeToYmd(new Date(2026, 6, 1, 14, 30))).toBe("2026-07-31");
  });

  // `toISOString().slice(0,10)` on a local midnight Date is the PREVIOUS day
  // anywhere east of Greenwich — every Israeli host would get a window one day
  // short. Pinned by building from local parts and checking the round trip.
  it("formats from local parts, so it round-trips through parseEventDate", () => {
    for (const now of [new Date(2026, 0, 1), new Date(2026, 11, 31, 23, 59), new Date(2026, 2, 27, 23, 30)]) {
      const ymd = postponeToYmd(now);
      const back = parseEventDate(ymd);
      expect(back, ymd).not.toBeNull();
      expect(daysBetween(startOfToday(now), back), ymd).toBe(PURGE_AFTER_DAYS);
    }
  });
});
