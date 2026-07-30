import { describe, it, expect } from "vitest";
import { buildEventIcs, icsFileName } from "./calendarFile.js";

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

  it("writes local times with no Z, so 19:00 stays 19:00 on any phone", () => {
    const ics = buildEventIcs({ ...base, startTime: "19:00" });
    expect(get(ics, "DTSTART")).toBe("20260915T190000");
    // The EVENT times are floating local. DTSTAMP is the exception — RFC 5545
    // §3.8.7.2 requires it in UTC, and it is not an event time.
    expect(get(ics, "DTSTART")).not.toMatch(/Z$/);
    expect(get(ics, "DTEND")).not.toMatch(/Z$/);
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

  it("defaults to a four-hour evening event", () => {
    const ics = buildEventIcs(base);
    expect(get(ics, "DTSTART")).toBe("20260915T190000");
    expect(get(ics, "DTEND")).toBe("20260915T230000");
  });

  it("honours an explicit end time", () => {
    const ics = buildEventIcs({ ...base, startTime: "18:30", endTime: "23:45" });
    expect(get(ics, "DTSTART")).toBe("20260915T183000");
    expect(get(ics, "DTEND")).toBe("20260915T234500");
  });

  // Clamping at 23:00 instead of rolling over gave a 23:30 event a DTEND of
  // 23:30 — a zero-length entry the calendar draws as a bare marker.
  it("rolls an end time past midnight onto the next day", () => {
    expect(get(buildEventIcs({ ...base, startTime: "21:00" }), "DTEND"))
      .toBe("20260916T010000");
    expect(get(buildEventIcs({ ...base, startTime: "23:30" }), "DTEND"))
      .toBe("20260916T033000");
  });

  it("reads an explicit end time earlier than the start as the small hours", () => {
    const ics = buildEventIcs({ ...base, startTime: "21:00", endTime: "01:30" });
    expect(get(ics, "DTSTART")).toBe("20260915T210000");
    expect(get(ics, "DTEND")).toBe("20260916T013000");
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
    expect(buildEventIcs(base)).toContain("TRIGGER:-P1D");
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
    const start = /DTSTART[^:]*:(\d{8})/.exec(ics)[1];
    const end   = /DTEND[^:]*:(\d{8})/.exec(ics)[1];
    expect(Number(end)).toBe(Number(start) + 1);
  });
});
