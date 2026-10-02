import { describe, it, expect } from "vitest";
import { EVENT_TYPE_TEMPLATES } from "./eventSiteTemplates.js";
import { EVENT_TYPES } from "./constants.js";

/* The English line over the event site's hero (owner, 2.10): the wedding
 * keeps "OUR WEDDING DAY"; every other type got a line of its own instead of
 * a bare label. The host can still edit or clear it. */
describe("event-site English hero line per type", () => {
  const lines = Object.fromEntries(Object.entries(EVENT_TYPE_TEMPLATES).map(([k, t]) => [k, t.heroEn]));

  it("the wedding keeps its line", () => {
    expect(lines["חתונה"]).toBe("OUR WEDDING DAY");
  });

  it("every event type has one, and no two types share it", () => {
    for (const t of EVENT_TYPES) expect(lines[t], t).toBeTruthy();
    const all = Object.values(lines);
    expect(new Set(all).size).toBe(all.length);
  });

  it("no bare label is left (the old defaults)", () => {
    for (const old of ["OUR EVENT", "BIRTHDAY", "FAMILY EVENT", "BAR MITZVAH", "BAT MITZVAH", "BRIT MILAH", "BABY NAMING", "HENNA NIGHT"]) {
      expect(Object.values(lines)).not.toContain(old);
    }
  });

  it("each line is English only — it is rendered with lang=\"en\"", () => {
    for (const [k, v] of Object.entries(lines)) expect(v, k).toMatch(/^[A-Z ,'.!-]+$/);
  });
});

/* Owner, 2.10: a business event does not ask its guests for a gift. */
import { defaultEventSite } from "./eventSiteTemplates.js";
describe("gift section default", () => {
  it("off for a business event, with no gift question in its FAQ", () => {
    const s = defaultEventSite("אירוע עסקי");
    expect(s.sections.gift).toBe(false);
    expect(s.faq.map(f => f.q).join(" ")).not.toMatch(/מתנה/);
  });
  it("still on for every other type", () => {
    for (const t of EVENT_TYPES.filter(x => x !== "אירוע עסקי")) expect(defaultEventSite(t).sections.gift, t).toBe(true);
  });
});
