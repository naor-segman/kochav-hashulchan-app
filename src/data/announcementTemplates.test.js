import { describe, it, expect } from "vitest";
import {
  defaultAnnouncement, defaultAnnouncements,
  normalizeAnnouncement, normalizeAnnouncements,
  announcementRoute, ANNOUNCEMENT_KINDS,
} from "./announcementTemplates.js";

describe("defaults", () => {
  it("gives the two kinds different opening content", () => {
    const s = defaultAnnouncement("saveTheDate", "wedding");
    const i = defaultAnnouncement("invitation", "wedding");
    expect(s.headline).not.toBe(i.headline);
  });

  it("starts unpublished so nothing goes live before the host is ready", () => {
    const a = defaultAnnouncements("wedding");
    expect(a.saveTheDate.enabled).toBe(false);
    expect(a.invitation.enabled).toBe(false);
  });

  it("does not ask for RSVP on a save-the-date, but does on the invitation", () => {
    expect(defaultAnnouncement("saveTheDate", "wedding").showRsvp).toBe(false);
    expect(defaultAnnouncement("invitation", "wedding").showRsvp).toBe(true);
  });

  it("shows a countdown on the save-the-date, which is its whole point", () => {
    expect(defaultAnnouncement("saveTheDate", "wedding").showCountdown).toBe(true);
  });

  it("adapts wording to the event type and falls back for unknown ones", () => {
    expect(defaultAnnouncement("invitation", "brit").headline).toContain("ברית");
    expect(defaultAnnouncement("invitation", "nonsense").headline)
      .toBe(defaultAnnouncement("invitation", "wedding").headline);
  });
});

describe("normalizeAnnouncement", () => {
  it("fills gaps without overwriting real values", () => {
    const a = normalizeAnnouncement({ headline: "בואו", enabled: true }, "invitation", "wedding");
    expect(a.headline).toBe("בואו");
    expect(a.enabled).toBe(true);
    expect(a.themeKey).toBe("sky");
    expect(a.layout).toBeTruthy();
  });

  it("rejects an unknown theme or layout rather than rendering a broken page", () => {
    const a = normalizeAnnouncement({ themeKey: "nope", layout: "nope" }, "invitation", "wedding");
    expect(a.themeKey).toBe("sky");
    expect(a.layout).toBe("card");
  });

  it("keeps false as false — an explicitly disabled toggle must stay off", () => {
    const a = normalizeAnnouncement({ showCountdown: false }, "saveTheDate", "wedding");
    expect(a.showCountdown).toBe(false);
  });

  it("survives junk input", () => {
    expect(normalizeAnnouncement(null, "invitation", "wedding").enabled).toBe(false);
    expect(normalizeAnnouncement("nope", "invitation", "wedding").enabled).toBe(false);
    expect(normalizeAnnouncements(undefined, "wedding").saveTheDate).toBeTruthy();
  });
});

describe("announcementRoute", () => {
  it("maps each kind to its public path", () => {
    expect(announcementRoute("saveTheDate")).toBe("save-the-date");
    expect(announcementRoute("invitation")).toBe("invitation");
  });
  it("falls back for an unknown kind", () => {
    expect(announcementRoute("bogus")).toBe("invitation");
  });
  it("every declared kind has a route", () => {
    for (const k of ANNOUNCEMENT_KINDS) expect(announcementRoute(k.key)).toBe(k.route);
  });
});
