import { describe, it, expect } from "vitest";
import { buildEventIcs, icsFileName, eventStartTime, DEFAULT_START } from "./calendarFile.js";

const base = { name: "חתונת דנה ויוסי", date: "2026-09-15", venue: "אולמי הגן" };
const get = (ics, key) => ics.split("\r\n").find(l => l.startsWith(key + ":"))?.slice(key.length + 1);

describe("buildEventIcs", () => {
  it("produces a valid-looking VEVENT", () => {
    const ics = buildEventIcs(base);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
  });

  it("uses CRLF line endings, which strict clients require", () => {
    expect(buildEventIcs(base)).toContain("\r\n");
  });

  // 61 / T3: the times used to be "floating" (no Z), so a guest whose phone
  // was in London got a 19:00 LONDON entry for a 19:00 Tel Aviv wedding. The
  // event happens in Israel; the file carries the instant, in UTC.
  it("writes the start as the Israel instant in UTC, with Z", () => {
    const ics = buildEventIcs({ ...base, startTime: "19:00" });
    expect(get(ics, "DTSTART")).toBe("20260915T160000Z");     // IDT, +3
    expect(get(buildEventIcs({ ...base, date: "2027-01-15", startTime: "19:00" }), "DTSTART"))
      .toBe("20270115T170000Z");                                 // IST, +2
  });

  it("writes DTSTAMP in UTC, as the spec requires", () => {
    expect(get(buildEventIcs(base), "DTSTAMP")).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it("folds content lines to 75 octets — Hebrew is 2 bytes per character", () => {
    // Unfolded, an ordinary Hebrew venue name blew past the limit and strict
    // parsers (Outlook) truncated it mid-word.
    const ics = buildEventIcs({
      ...base,
      name:  "החתונה של דנה כהן ויוסי לוי",
      venue: "אולמי הגן הקסום, רחוב הרצל 42, ראשון לציון",
      description: "מתרגשים לחגוג איתכם! קבלת פנים בשעה 19:00, החופה בשעה 20:00.",
    });
    const enc = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(enc.encode(line).length).toBeLessThanOrEqual(75);
    }
    // And it actually folded rather than just fitting by luck.
    expect(ics.split("\r\n").some(l => l.startsWith(" "))).toBe(true);
  });

  // 36b: with no start time known the file said a confident 19:00 nobody wrote.
  it("with no start time, writes an all-day entry", () => {
    const ics = buildEventIcs(base);
    expect(get(ics, "DTSTART;VALUE=DATE")).toBe("20260915");
    expect(get(ics, "DTEND;VALUE=DATE")).toBe("20260916");      // exclusive
    expect(ics).not.toMatch(/T190000/);
    expect(buildEventIcs({ ...base, startTime: "ערב" })).toContain("DTSTART;VALUE=DATE:20260915");
  });

  it("an all-day entry on the last day of a month ends on the 1st", () => {
    expect(get(buildEventIcs({ ...base, date: "2026-12-31" }), "DTEND;VALUE=DATE")).toBe("20270101");
  });

  it("defaults to a four-hour event", () => {
    const ics = buildEventIcs({ ...base, startTime: "19:00" });
    expect(get(ics, "DTEND")).toBe("20260915T200000Z");
  });

  it("honours an explicit end time", () => {
    const ics = buildEventIcs({ ...base, startTime: "18:30", endTime: "23:45" });
    expect(get(ics, "DTSTART")).toBe("20260915T153000Z");
    expect(get(ics, "DTEND")).toBe("20260915T204500Z");
  });

  // Clamping at 23:00 instead of rolling over gave a 23:30 event a DTEND of
  // 23:30 — a zero-length entry the calendar draws as a bare marker.
  it("rolls an end time past midnight onto the next day", () => {
    expect(get(buildEventIcs({ ...base, startTime: "21:00" }), "DTEND"))
      .toBe("20260915T220000Z");                                 // 01:00 Israel, the 16th
    expect(get(buildEventIcs({ ...base, startTime: "23:30" }), "DTEND"))
      .toBe("20260916T003000Z");                                 // 03:30 Israel, the 16th
  });

  it("reads an explicit end time earlier than the start as the small hours", () => {
    const ics = buildEventIcs({ ...base, startTime: "21:00", endTime: "01:30" });
    expect(get(ics, "DTSTART")).toBe("20260915T180000Z");
    expect(get(ics, "DTEND")).toBe("20260915T223000Z");          // 01:30 Israel, the 16th
  });

  it("never emits a zero-length event", () => {
    for (const startTime of ["19:00", "21:00", "23:00", "23:59"]) {
      const ics = buildEventIcs({ ...base, startTime });
      expect(get(ics, "DTEND")).not.toBe(get(ics, "DTSTART"));
    }
  });

  it("escapes commas and semicolons per RFC 5545", () => {
    const ics = buildEventIcs({ ...base, venue: "אולם, רחוב א; קומה 2" });
    expect(get(ics, "LOCATION")).toBe(String.raw`אולם\, רחוב א\; קומה 2`);
  });

  it("includes a day-before reminder", () => {
    expect(buildEventIcs({ ...base, startTime: "19:00" })).toContain("TRIGGER:-P1D");
    // An all-day entry starts at midnight: noon the day before, not midnight.
    expect(buildEventIcs(base)).toContain("TRIGGER:-PT12H");
  });

  it("keeps a stable UID for the same event", () => {
    expect(get(buildEventIcs(base), "UID")).toBe(get(buildEventIcs(base), "UID"));
  });

  it("returns null for a missing or malformed date rather than a broken file", () => {
    expect(buildEventIcs({ ...base, date: "" })).toBeNull();
    expect(buildEventIcs({ ...base, date: "15/09/2026" })).toBeNull();
    expect(buildEventIcs({ ...base, date: undefined })).toBeNull();
  });

  it("omits optional lines that have no value", () => {
    const ics = buildEventIcs({ name: "x", date: "2026-09-15" });
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("URL:");
  });
});

describe("icsFileName", () => {
  it("keeps Hebrew and strips characters filesystems reject", () => {
    expect(icsFileName('חתונה/של: דנה?')).toBe("חתונהשל דנה.ics");
  });
  it("falls back when the name is empty", () => {
    expect(icsFileName("")).toBe("אירוע.ics");
    expect(icsFileName(undefined)).toBe("אירוע.ics");
  });
});

describe("an end time equal to the start", () => {
  it("does not produce a 24-hour block", () => {
    // `<=` was there for a 21:00 start ending at 01:00. Equality fell through
    // it, so a host who typed the same time twice put a whole day in every
    // guest's calendar.
    const ics = buildEventIcs({
      name: "חתונה", date: "2027-09-15", venue: "אולמי הגן",
      startTime: "21:00", endTime: "21:00",
    });
    const start = /DTSTART[^:]*:(\d{8}T\d{6})/.exec(ics)[1];
    const end   = /DTEND[^:]*:(\d{8}T\d{6})/.exec(ics)[1];
    expect(start.slice(0, 8)).toBe(end.slice(0, 8));   // same calendar day
  });

  it("still rolls a past-midnight end onto the next day", () => {
    const ics = buildEventIcs({
      name: "חתונה", date: "2027-09-15", venue: "אולמי הגן",
      startTime: "21:00", endTime: "01:00",
    });
    // 21:00 → 01:00 Israel is four hours, the end on the NEXT Israel day.
    const start = /DTSTART:(\d{8}T\d{6}Z)/.exec(ics)[1];
    const end   = /DTEND:(\d{8}T\d{6}Z)/.exec(ics)[1];
    expect([start, end]).toEqual(["20270915T180000Z", "20270915T220000Z"]);
  });
});

describe("eventStartTime — one start time for the countdown and the calendar", () => {
  it("takes the first valid schedule time", () => {
    expect(eventStartTime([{ time: "21:00" }, { time: "22:30" }])).toBe("21:00");
    expect(eventStartTime([{ time: "" }, { time: "9:15" }])).toBe("09:15");
  });
  it("skips junk and falls back to DEFAULT_START", () => {
    expect(eventStartTime([{ time: "25:00" }, { time: "ערב" }])).toBe(DEFAULT_START);
    expect(eventStartTime(null)).toBe(DEFAULT_START);
    expect(eventStartTime([])).toBe(DEFAULT_START);
  });
});
