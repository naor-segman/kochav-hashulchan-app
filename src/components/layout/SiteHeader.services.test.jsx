// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { render, fireEvent, screen } from "../../test/dom.js";
import SiteHeader from "./SiteHeader.jsx";
import { flagService, menuServices, liveServices } from "../../data/services.js";

/* Audit 3.10, P2-1: six service links flat in the bar wrapped seven labels
 * onto two lines at 1024–1440. Five now sit behind "השירותים ▾"; this pins
 * the disclosure's behaviour. The widths themselves are measured in a browser
 * by qa/siteHeader.mjs — jsdom has no layout. */

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}
const renderAt = (path = "/home") => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="*" element={<><SiteHeader /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const servicesButton = () => screen.getByRole("button", { name: /השירותים/ });
const panel = () => document.getElementById(servicesButton().getAttribute("aria-controls"));

describe("site header — the services disclosure", () => {
  it("every live service is reachable from the bar: the flag in it, the rest behind the button", () => {
    renderAt();
    const bar = document.querySelector("header");
    const flag = flagService();
    expect(bar.querySelector(`a[href="${flag.path}"]`)).not.toBeNull();
    const inPanel = [...panel().querySelectorAll("a")].map(a => a.getAttribute("href"));
    expect(inPanel).toEqual(menuServices().map(s => s.path));
    const reachable = new Set([flag.path, ...inPanel]);
    for (const s of liveServices()) expect(reachable.has(s.path), s.path).toBe(true);
  });

  it("is closed at rest, and aria-controls names the list it opens", () => {
    renderAt();
    expect(servicesButton().getAttribute("aria-expanded")).toBe("false");
    expect(panel()).not.toBeNull();
    expect(panel().hidden).toBe(true);
    fireEvent.click(servicesButton());
    expect(servicesButton().getAttribute("aria-expanded")).toBe("true");
    expect(panel().hidden).toBe(false);
  });

  it("Escape closes it and focus returns to the button", () => {
    renderAt();
    fireEvent.click(servicesButton());
    panel().querySelector("a").focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(servicesButton().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(servicesButton());
  });

  it("a press outside closes it; a press inside does not", () => {
    renderAt();
    fireEvent.click(servicesButton());
    fireEvent.pointerDown(panel());
    expect(servicesButton().getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(document.body);
    expect(servicesButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("following a link navigates and closes it", () => {
    renderAt();
    fireEvent.click(servicesButton());
    const last = menuServices().at(-1);
    fireEvent.click(panel().querySelector(`a[href="${last.path}"]`));
    expect(screen.getByTestId("where").textContent).toBe(last.path);
    expect(servicesButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("focus leaving the button and its list closes it", () => {
    renderAt();
    fireEvent.click(servicesButton());
    const links = panel().querySelectorAll("a");
    // Moving within it keeps it open…
    fireEvent.blur(links[0], { relatedTarget: links[1] });
    expect(servicesButton().getAttribute("aria-expanded")).toBe("true");
    // …moving past the last link closes it.
    fireEvent.blur(links[links.length - 1], { relatedTarget: document.querySelector('a[href="/pricing"]') });
    expect(servicesButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("its caret is decorative", () => {
    renderAt();
    const caret = [...servicesButton().querySelectorAll("*")].find(el => el.textContent === "▾");
    expect(caret?.getAttribute("aria-hidden")).toBe("true");
  });
});
