// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import EventSiteScreen from "./EventSiteScreen.jsx";
import { defaultEventSite } from "../data/eventSiteTemplates.js";

/* The site countdown aimed at 18:00 for every event (WORKPLAN ס). An event
 * starting at 21:00, viewed at 19:00 on the day, must have 2 hours left —
 * not zero. Israel time, like the page since 29.9 (it read the VIEWER's zone,
 * so a guest abroad counted to the wrong moment) — the clock is set as an
 * instant, so this holds on a machine in any zone. */

afterEach(() => vi.useRealTimers());

const cells = () => [...document.querySelectorAll("[class*=cdUnit]")].map(el => el.textContent);

describe("event site countdown", () => {
  it("counts to the event's own start time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T16:00:00Z"));   // 1 Oct 2026, 19:00 in Israel (UTC+3)
    const site = { ...defaultEventSite("חתונה"), enabled: true,
      schedule: [{ id: "s1", time: "21:00", title: "חופה" }] };
    render(
      <MemoryRouter>
        <EventSiteScreen localEvent={{ name: "החתונה", type: "חתונה", date: "2026-10-01",
          brideName: "דנה", groomName: "יוסי", eventSite: site, tokens: {} }} />
      </MemoryRouter>
    );
    expect(screen.getByText("הספירה לקראת האירוע")).toBeInTheDocument();
    expect(cells()[0]).toContain("0");       // days
    expect(cells()[1]).toContain("02");      // hours — was 00 with the 18:00 target
  });
});
