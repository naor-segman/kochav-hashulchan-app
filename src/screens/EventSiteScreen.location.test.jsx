// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import EventSiteScreen from "./EventSiteScreen.jsx";
import { defaultEventSite } from "../data/eventSiteTemplates.js";
import { siteLocation } from "../utils/siteLocation.js";

/* Owner, 3.10: the site's "מיקום והגעה" (address, Waze) used the address typed
 * in the site editor ONLY. The venue from the event's own details never
 * reached it, so a host who did not open that card published a site with no
 * directions. Now the venue is the default and a typed address replaces it. */

const show = (venue, address = "") => render(
  <MemoryRouter>
    <EventSiteScreen localEvent={{ name: "החתונה", type: "חתונה", date: "2027-06-01", venue,
      brideName: "דנה", groomName: "יוסי", eventSite: { ...defaultEventSite("חתונה"), enabled: true, address } }} />
  </MemoryRouter>,
);
const waze = () => screen.queryByRole("link", { name: /Waze/ });

describe("event site → where the event is", () => {
  it("with no address typed, the venue from the event's details is shown, with Waze to it", () => {
    show("אולמי הגן, רחובות");
    expect(screen.getByRole("heading", { name: "מיקום והגעה" })).toBeInTheDocument();
    expect(waze().getAttribute("href")).toBe("https://waze.com/ul?q=" + encodeURIComponent("אולמי הגן, רחובות"));
  });

  it("an address typed in the editor replaces the venue", () => {
    show("אולמי הגן, רחובות", "הרצל 5, רחובות");
    expect(waze().getAttribute("href")).toContain(encodeURIComponent("הרצל 5, רחובות"));
  });

  it("neither: no location section rather than an empty one", () => {
    show("");
    expect(screen.queryByRole("heading", { name: "מיקום והגעה" })).toBeNull();
  });

  it("siteLocation: blank-only address falls back too", () => {
    expect(siteLocation({ address: "   " }, { venue: "אולם" })).toBe("אולם");
  });
});
