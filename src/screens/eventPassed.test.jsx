// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import { defaultEventSite } from "../data/eventSiteTemplates.js";

/* 36h: nothing on the guest pages knew the event was over — the site's clock
 * sat at 0 00 00 00 for ever, and the RSVP link still asked "האם תגיע/י"
 * the week after. FZ6: a date that does not parse rendered NaN in every
 * countdown cell, and an FAQ question stored as a number crashed the site. */
let EVENT;
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => EVENT,
}));
const { default: EventSiteScreen } = await import("./EventSiteScreen.jsx");
const { default: RSVPScreen } = await import("./RSVPScreen.jsx");

afterEach(() => vi.useRealTimers());
const at = (iso) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };

const site = (extra = {}) => ({ ...defaultEventSite("חתונה"), enabled: true,
  schedule: [{ id: "s1", time: "21:00", title: "חופה" }], ...extra });
const renderSite = (ev) => render(<MemoryRouter><EventSiteScreen localEvent={{
  name: "החתונה", type: "חתונה", brideName: "דנה", groomName: "יוסי", tokens: {}, ...ev }} /></MemoryRouter>);

describe("the site's countdown", () => {
  it("is gone once the event has started", () => {
    at("2026-10-02T09:00:00Z");                       // the morning after a 1 Oct wedding
    renderSite({ date: "2026-10-01", eventSite: site() });
    expect(screen.queryByText("הספירה לקראת האירוע")).toBeNull();
  });

  it("is gone, not NaN, for a date that does not parse", () => {
    at("2026-09-01T09:00:00Z");
    renderSite({ date: "15/09/2026", eventSite: site() });
    expect(document.body.textContent).not.toMatch(/NaN/);
    expect(screen.queryByText("הספירה לקראת האירוע")).toBeNull();
  });
});

describe("the site's FAQ", () => {
  it("survives a question stored as a number or an object", () => {
    at("2026-09-01T09:00:00Z");
    renderSite({ date: "2026-10-01", eventSite: site({
      sections: { ...defaultEventSite("חתונה").sections, faq: true },
      faq: [{ id: "1", q: 5, a: "כן" }, { id: "2", q: { x: 1 }, a: "לא" }, { id: "3", q: "חניה?", a: "יש" }],
    }) });
    expect(screen.getByText("חניה?")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});

describe("the RSVP page after the event", () => {
  const renderRsvp = () => render(<MemoryRouter initialEntries={["/rsvp/tok12345"]}><Routes>
    <Route path="/rsvp/:token" element={<RSVPScreen />} />
  </Routes></MemoryRouter>);

  it("says the event took place instead of asking who is coming, and keeps the site and gift links", async () => {
    at("2026-10-02T09:00:00Z");
    EVENT = { cloudId: "c1", name: "החתונה", date: "2026-10-01", type: "חתונה", brideName: "דנה", groomName: "יוסי",
      inviteToken: "inv12345", giftToken: "gift1234", site: { enabled: true, sections: {} } };
    renderRsvp();
    expect(await screen.findByText("האירוע התקיים")).toBeInTheDocument();
    expect(screen.queryByText(/האם תגיע/)).toBeNull();
    expect(screen.getByRole("link", { name: /לאתר האירוע/ }).getAttribute("href")).toBe("/invite/inv12345");
    expect(screen.getByRole("link", { name: /מתנה/ }).getAttribute("href")).toBe("/gift/gift1234");
  });

  it("on the day itself still takes answers", async () => {
    at("2026-10-01T09:00:00Z");
    EVENT = { cloudId: "c1", name: "החתונה", date: "2026-10-01", type: "חתונה", site: { enabled: true } };
    renderRsvp();
    expect(await screen.findByText(/האם תגיע/)).toBeInTheDocument();
  });
});
