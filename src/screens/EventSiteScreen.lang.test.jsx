// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import EventSiteScreen from "./EventSiteScreen.jsx";
import { defaultEventSite } from "../data/eventSiteTemplates.js";

/* 108: the hero's English line sat in a he/rtl page with no language of its
 * own — read with Hebrew phonetics, and "OUR DAY!" rendered as "!OUR DAY". */
const renderSite = (heroEn) => render(<MemoryRouter><EventSiteScreen localEvent={{
  name: "החתונה", type: "חתונה", date: "2099-06-01", brideName: "דנה", groomName: "יוסי", tokens: {},
  eventSite: { ...defaultEventSite("חתונה"), enabled: true, heroEn },
}} /></MemoryRouter>);

describe("the hero's English line", () => {
  it("is marked lang=en, dir=ltr", () => {
    renderSite("OUR WEDDING DAY!");
    const el = screen.getByText("OUR WEDDING DAY!");
    expect(el.getAttribute("lang")).toBe("en");
    expect(el.getAttribute("dir")).toBe("ltr");
  });
  it("is left alone when the host wrote it in Hebrew", () => {
    renderSite("היום הגדול שלנו");
    const el = screen.getByText("היום הגדול שלנו");
    expect(el.getAttribute("lang")).toBeNull();
    expect(el.getAttribute("dir")).toBeNull();
  });
});
