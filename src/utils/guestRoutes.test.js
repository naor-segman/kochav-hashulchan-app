import { describe, it, expect } from "vitest";
import { isGuestRoute, guestHosts, guestEventType, GUEST_ROUTE_PREFIXES, collabGroupOptions } from "./guestRoutes.js";

describe("guestRoutes", () => {
  it("knows a guest page from a host page", () => {
    for (const p of GUEST_ROUTE_PREFIXES) expect(isGuestRoute(`/${p}/tok12345`), p).toBe(true);
    expect(isGuestRoute("/gift/tok12345/wall")).toBe(true);
    // The host's own door screen and every app/marketing page are not guest pages.
    for (const p of ["/events/e1/entrance", "/app", "/pricing", "/", "/rsvp", "/rsvp/"]) {
      expect(isGuestRoute(p), p).toBe(false);
    }
  });

  it("never prints the raw 'אחר' type to a guest", () => {
    expect(guestEventType("אחר")).toBe("");
    expect(guestEventType("חתונה")).toBe("חתונה");
    expect(guestEventType(undefined)).toBe("");
  });

  it("names the hosts the way a guest reads them", () => {
    expect(guestHosts({ brideName: "דנה", groomName: "יוסי", name: "x" })).toBe("דנה ויוסי");
    expect(guestHosts({ celebrantName: "איתי", name: "x" })).toBe("איתי");
    expect(guestHosts({ name: "ערב החברה" })).toBe("ערב החברה");
    expect(guestHosts(null)).toBe("");
  });
});

describe("collabGroupOptions — the host's own groups on the family table (106)", () => {
  const BUILT = ["משפחה", "חברים"];
  it("adds the host's groups after the built-in ones", () => {
    expect(collabGroupOptions(BUILT, ["חברים מהצבא"], "")).toEqual(["משפחה", "חברים", "חברים מהצבא"]);
  });
  it("keeps a row's current group even if it is in neither list", () => {
    expect(collabGroupOptions(BUILT, [], "ועד הבית")).toEqual(["משפחה", "חברים", "ועד הבית"]);
  });
  it("dedupes and drops junk", () => {
    expect(collabGroupOptions(BUILT, ["חברים", "", null, 7], "משפחה")).toEqual(["משפחה", "חברים"]);
  });
});
