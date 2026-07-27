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
    expect(ics).not.toContain("Z\r\n");
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

  it("never rolls the end hour past 23", () => {
    const ics = buildEventIcs({ ...base, startTime: "21:00" });
    expect(get(ics, "DTEND")).toBe("20260915T230000");
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
