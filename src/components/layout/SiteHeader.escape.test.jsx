// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, fireEvent } from "../../test/dom.js";
import SiteHeader from "./SiteHeader.jsx";

/* 37f (1.10): the marketing site's phone menu had no way out by keyboard. */
describe("site header — phone menu", () => {
  it("Escape closes it and focus returns to the button", () => {
    render(<MemoryRouter><SiteHeader /></MemoryRouter>);
    const burger = document.querySelector('button[aria-label="פתיחת תפריט"]');   // CSS hides it above 1023px
    fireEvent.click(burger);
    expect(burger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(burger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(burger);
  });
});
