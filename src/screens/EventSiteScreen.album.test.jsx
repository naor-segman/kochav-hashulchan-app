// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import EventSiteScreen from "./EventSiteScreen.jsx";
import { defaultEventSite } from "../data/eventSiteTemplates.js";

/* WORKPLAN פ: the shared album was reachable only from a link the host sent
 * separately. The site now links it — from the day of the event on. */

afterEach(() => vi.useRealTimers());

const renderOn = (today, tokens = { album: "albumtok11" }) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(today);
  const site = { ...defaultEventSite("חתונה"), enabled: true };
  render(
    <MemoryRouter>
      <EventSiteScreen localEvent={{ name: "החתונה", type: "חתונה", date: "2026-10-01",
        brideName: "דנה", groomName: "יוסי", eventSite: site, tokens }} />
    </MemoryRouter>
  );
};
const albumLink = () => screen.queryByRole("link", { name: /לאלבום/ });

describe("event site → shared album", () => {
  it("links the album on the day of the event", () => {
    renderOn(new Date(2026, 9, 1, 22, 0));
    expect(albumLink()).toHaveAttribute("href", "/album/albumtok11");
  });

  it("and after it", () => {
    renderOn(new Date(2026, 9, 9, 10, 0));
    expect(albumLink()).toHaveAttribute("href", "/album/albumtok11");
  });

  it("not before — an empty album weeks ahead reads as broken", () => {
    renderOn(new Date(2026, 8, 28, 10, 0));
    expect(albumLink()).toBeNull();
  });

  it("not without a token", () => {
    renderOn(new Date(2026, 9, 1, 22, 0), {});
    expect(albumLink()).toBeNull();
  });
});
