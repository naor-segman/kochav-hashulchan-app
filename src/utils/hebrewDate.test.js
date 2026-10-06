import { describe, it, expect } from "vitest";
import { gematria, hebrewCalendarDate, startsAfterSunset, hebrewDateTime } from "./hebrewDate.js";

describe("gematria", () => {
  it("writes numbers the way a date is written", () => {
    expect(gematria(1)).toBe("א׳");
    expect(gematria(10)).toBe("י׳");
    expect(gematria(11)).toBe("י״א");
    expect(gematria(25)).toBe("כ״ה");
    expect(gematria(30)).toBe("ל׳");
    expect(gematria(787)).toBe("תשפ״ז");
    expect(gematria(800)).toBe("ת״ת");
  });
  it("15 and 16 are ט״ו and ט״ז, never the Name", () => {
    expect(gematria(15)).toBe("ט״ו");
    expect(gematria(16)).toBe("ט״ז");
    expect(gematria(115)).toBe("קט״ו");
  });
  it("nothing for what is not a day or a year", () => {
    expect(gematria(0)).toBe("");
    expect(gematria(-3)).toBe("");
    expect(gematria("x")).toBe("");
  });
});

describe("hebrewCalendarDate", () => {
  it("known dates (checked against a Hebrew calendar)", () => {
    expect(hebrewCalendarDate("2026-10-06")).toBe("כ״ה בתשרי תשפ״ז");
    expect(hebrewCalendarDate("2027-05-20")).toBe("י״ג באייר תשפ״ז");
    expect(hebrewCalendarDate("2026-12-25")).toBe("ט״ו בטבת תשפ״ז");
  });
  it("is the civil day, not the day before (bug class 2)", () => {
    // new Date("2026-10-06") is UTC midnight — the 5th in the Americas, and
    // the wrong Hebrew date. Built from parts, it is the 6th everywhere.
    expect(hebrewCalendarDate("2026-10-06")).not.toBe(hebrewCalendarDate("2026-10-05"));
  });
  it("nothing for an empty or impossible date", () => {
    expect(hebrewCalendarDate("")).toBe("");
    expect(hebrewCalendarDate(undefined)).toBe("");
    expect(hebrewCalendarDate("2026-02-31")).toBe("");
    expect(hebrewCalendarDate("6.10.2026")).toBe("");
  });
});

describe("every page a guest opens shows it (137)", () => {
  it("invitation / save-the-date, invite, RSVP and the event site render <HebrewDate>", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["AnnouncementScreen", "InviteScreen", "RSVPScreen", "EventSiteScreen"]) {
      const src = readFileSync(new URL(`../screens/${f}.jsx`, import.meta.url), "utf8");
      expect(src, f).toMatch(/<HebrewDate date=\{(event|ev)\.date\} event=\{(event|ev)\} \/>/);
    }
  });
});

describe("the start time decides it (137, owner 6.10)", () => {
  // Sunset in Tel Aviv on 6.10.2026 is ~18:20 IDT.
  it("before sunset: that day's Hebrew date; after: the next day's", () => {
    expect(hebrewCalendarDate("2026-10-06", "12:00")).toBe("כ״ה בתשרי תשפ״ז");
    expect(hebrewCalendarDate("2026-10-06", "19:30")).toBe("כ״ו בתשרי תשפ״ז");
    expect(startsAfterSunset("2026-10-06", "19:30")).toBe(true);
    expect(startsAfterSunset("2026-10-06", "17:00")).toBe(false);
  });
  it("crosses a month and a year correctly", () => {
    // 2026-09-11 evening is Rosh Hashana 5787.
    expect(hebrewCalendarDate("2026-09-11", "20:00")).toBe("א׳ בתשרי תשפ״ז");
    expect(hebrewCalendarDate("2026-09-11", "10:00")).toBe("כ״ט באלול תשפ״ו");
  });
  it("no time, or not a time: the daytime date", () => {
    expect(hebrewCalendarDate("2026-10-06", "")).toBe("כ״ה בתשרי תשפ״ז");
    expect(hebrewCalendarDate("2026-10-06", "evening")).toBe("כ״ה בתשרי תשפ״ז");
    expect(hebrewCalendarDate("2026-10-06", "25:00")).toBe("כ״ה בתשרי תשפ״ז");
  });
  it("a guest page takes the host's reception time, else the site's first scheduled time", () => {
    expect(hebrewDateTime({ receptionTime: "19:30", site: { schedule: [{ time: "18:00" }] } })).toBe("19:30");
    expect(hebrewDateTime({ site: { schedule: [{ title: "x" }, { time: "20:15" }] } })).toBe("20:15");
    expect(hebrewDateTime({ eventSite: { schedule: [{ time: "9:30" }] } })).toBe("09:30");
    expect(hebrewDateTime({})).toBe("");
  });
});
