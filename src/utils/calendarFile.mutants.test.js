import { describe, it, expect, vi, afterEach } from "vitest";
import { buildEventIcs, eventStartTime, israelInstant, icsFileName } from "./calendarFile.js";

// Eight edits to calendarFile.js passed the whole suite in the third-review
// mutation run (29.9). The .ics file is read by parsers this project never
// sees — iOS, Outlook, Google — and most of them do not report a malformed
// file, they silently import part of it or none. So each test states the RFC
// 5545 rule or the guest-visible symptom, and asserts on the file's bytes.

const octets = s => new TextEncoder().encode(s).length;
const physicalLines = ics => ics.split("\r\n");

afterEach(() => { vi.useRealTimers(); });

describe("text values: a newline is escaped, never written raw", () => {
  // A raw LF inside DESCRIPTION ends the content line; the next line starts
  // with the second sentence of the host's text, which is not a property name.
  // Strict parsers reject the event; lenient ones drop everything after it.
  it("DESCRIPTION with two lines → one content line with \\n", () => {
    const ics = buildEventIcs({ name: "חתונה", date: "2026-10-01", description: "שורה 1\nשורה 2" });
    expect(ics).toContain("DESCRIPTION:שורה 1\\nשורה 2");
    expect(ics.split("\r\n").join("").includes("\n")).toBe(false);
  });
});

describe("times are always a real time of day", () => {
  // "25:00" is a typo a host can make in the schedule. DTSTART:…T250000 is not
  // a valid DATE-TIME, and the calendar app refuses the whole file.
  it("start 25:00 → T23…, never T25…", () => {
    const ics = buildEventIcs({ name: "x", date: "2026-10-01", startTime: "25:00" });
    expect(ics).toMatch(/DTSTART:20261001T2300\d\d/);
    expect(ics).not.toMatch(/T25/);
  });
  // The site countdown and the calendar button both read the start from the
  // schedule through this one helper. "19:75" is not a time; the next valid
  // entry is.
  it("eventStartTime skips an entry whose minutes are out of range", () => {
    expect(eventStartTime([{ time: "19:75" }, { time: "20:00" }])).toBe("20:00");
  });
});

describe("israelInstant across the October clock change", () => {
  // 2026-10-25 02:00 IDT → 01:00 IST. A single offset lookup reads the offset
  // at the WRONG instant (the wall clock taken as UTC, which is already past
  // the change) and lands an hour off: the countdown for a 00:30 start ends at
  // 01:30. The second lookup is what settles it on the right side.
  it("00:30 on the night of the change is 21:30Z the day before (still IDT, +3)", () => {
    expect(israelInstant("2026-10-25", "00:30")).toBe(Date.UTC(2026, 9, 24, 21, 30));
  });
  it("and an ordinary summer evening is +3", () => {
    expect(israelInstant("2026-07-01", "19:00")).toBe(Date.UTC(2026, 6, 1, 16, 0));
  });
});

describe("folding: no physical line longer than 75 octets", () => {
  // RFC 5545 §3.1 — and Outlook, in practice, truncates past it. The limit is
  // in OCTETS, so Hebrew (2 bytes a letter) reaches it at ~35 characters.
  it("a line of 76–80 octets is folded", () => {
    // "SUMMARY:" is 8 octets; 70 ASCII letters make a 78-octet line.
    const ics = buildEventIcs({ name: "a".repeat(70), date: "2026-10-01" });
    for (const l of physicalLines(ics)) expect(octets(l), l).toBeLessThanOrEqual(75);
  });
  it("continuation lines count their leading space", () => {
    const ics = buildEventIcs({ name: "b".repeat(300), date: "2026-10-01", venue: "אולם ".repeat(40) });
    for (const l of physicalLines(ics)) expect(octets(l), l).toBeLessThanOrEqual(75);
  });
});

describe("file name and UID", () => {
  // A 150-letter Hebrew event name is 300 bytes in UTF-8 — past the 255-byte
  // file-name limit of ext4, the filesystem most Android phones save to.
  it("the file name is cut to 60 characters", () => {
    const f = icsFileName("א".repeat(150));
    expect(f).toBe("א".repeat(60) + ".ics");
  });
  // The UID is how a calendar recognises "the same event again". Downloading
  // the invitation twice — every guest who taps the button on two devices, or
  // after the host fixes the venue — must UPDATE the entry, not add a second one.
  it("two downloads of the same event, minutes apart, carry the same UID", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
    const a = buildEventIcs({ name: "חתונה", date: "2026-10-01" }).match(/^UID:.*$/m)[0];
    vi.setSystemTime(new Date("2026-09-01T10:07:00Z"));
    const b = buildEventIcs({ name: "חתונה", date: "2026-10-01" }).match(/^UID:.*$/m)[0];
    expect(b).toBe(a);
  });
});
