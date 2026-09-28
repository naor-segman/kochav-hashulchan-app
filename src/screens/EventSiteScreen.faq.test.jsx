// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import EventSiteScreen from "./EventSiteScreen.jsx";
import { defaultEventSite } from "../data/eventSiteTemplates.js";

/* A question the host never answered is not shown to guests (28.9 audit).
 * The default template ships "איך מגיעים לאירוע? יש חניה?" with an EMPTY
 * answer, and the live site rendered it as a question that opens onto
 * nothing. Uses the real template default, not a hand-written fixture, so the
 * test follows the template if it changes. */

const site = { ...defaultEventSite("חתונה"), enabled: true };
const ev = {
  name: "החתונה של דנה ויוסי", type: "חתונה", date: "2026-10-01", venue: "",
  brideName: "דנה", groomName: "יוסי", eventSite: site, tokens: {},
};

const renderSite = (eventSite) => render(
  <MemoryRouter><EventSiteScreen localEvent={{ ...ev, eventSite }} /></MemoryRouter>
);

describe("event site FAQ", () => {
  it("the default template really does ship an unanswered question (the premise)", () => {
    expect(site.faq.some(f => f.q && !f.a)).toBe(true);
  });

  it("hides the unanswered question and keeps the answered ones", () => {
    renderSite(site);
    expect(screen.queryByText("איך מגיעים לאירוע? יש חניה?")).toBeNull();
    expect(screen.getByText("מתי צריך לאשר הגעה?")).toBeInTheDocument();
  });

  it("drops the whole section when nothing is answered", () => {
    renderSite({ ...site, faq: site.faq.map(f => ({ ...f, a: "  " })) });
    expect(screen.queryByText("שאלות נפוצות")).toBeNull();
  });
});
