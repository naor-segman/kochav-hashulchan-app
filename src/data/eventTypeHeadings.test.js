import { describe, it, expect } from "vitest";
import { EVENT_TYPES, EVENT_TYPE_HEADINGS, eventTypeHeading } from "./constants.js";

/**
 * Bug class 1, on the first heading anybody reads.
 *
 * The opening screen's question is chosen by event type, and an event type is
 * the HEBREW string in EVENT_TYPES. A map keyed on an English key ("wedding")
 * would not throw — every type would quietly get the fallback, and nine
 * different events would all be asked the same generic question, which is
 * exactly the complaint this map exists to answer. So the assertions below are
 * on the Hebrew RESULT, never on the lookup that produced it.
 */
describe("EVENT_TYPE_HEADINGS", () => {
  it("has a heading for every canonical event type", () => {
    for (const t of EVENT_TYPES) {
      expect(EVENT_TYPE_HEADINGS[t], `missing heading for ${t}`).toBeTruthy();
    }
  });

  it("is keyed in Hebrew — no English keys, which would match nothing", () => {
    for (const k of Object.keys(EVENT_TYPE_HEADINGS)) {
      expect(/[֐-׿]/.test(k), `key is not Hebrew: ${k}`).toBe(true);
    }
  });

  it("gives each type its own question — not one generic line for every type", () => {
    const headings = EVENT_TYPES.map(eventTypeHeading);
    // "אחר" is the deliberate catch-all and shares its wording with the
    // fallback; every other type must be distinct from every other type.
    const named = EVENT_TYPES.filter(t => t !== "אחר").map(eventTypeHeading);
    expect(new Set(named).size).toBe(named.length);
    expect(headings.every(h => h.endsWith("?"))).toBe(true);
  });

  it("asks a wedding about the couple and a birthday about who is celebrating", () => {
    expect(eventTypeHeading("חתונה")).toBe("מי הזוג המאושר?");
    expect(eventTypeHeading("יום הולדת")).toBe("למי אנחנו חוגגים?");
    // Same "wedding" kind in getEventPersonalConfig, different question —
    // a branch keyed on the KIND alone would give all three the same line.
    expect(eventTypeHeading("אירוס")).not.toBe(eventTypeHeading("חתונה"));
    expect(eventTypeHeading("חינה")).not.toBe(eventTypeHeading("חתונה"));
  });

  it("falls back for a type it does not know, and for an English key", () => {
    // Admin-managed templates contribute free-text types to the same select.
    expect(eventTypeHeading("ערב גיבוש")).toBe(EVENT_TYPE_HEADINGS["אחר"]);
    expect(eventTypeHeading("wedding")).toBe(EVENT_TYPE_HEADINGS["אחר"]);
    expect(eventTypeHeading(undefined)).toBe(EVENT_TYPE_HEADINGS["אחר"]);
  });

  it("carries no emoji — 102 were removed from the chrome and stay removed", () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const h of Object.values(EVENT_TYPE_HEADINGS)) {
      expect(emoji.test(h), `emoji in heading: ${h}`).toBe(false);
    }
  });
});
