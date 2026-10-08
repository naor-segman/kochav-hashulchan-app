// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter, Link, Routes, Route, useLocation } from "react-router-dom";
import { render, screen, fireEvent } from "../../test/dom.js";
import { DemoOnly, SampleLinkGuard, SAMPLE_GUEST_PATH } from "./SampleDemo.jsx";

// Owner, 8.10: the sample invitation is for looking — the gift and RSVP forms
// must not really be fillable, and nothing inside the phone may lead to the
// real app.

const Where = () => <span data-testid="where">{useLocation().pathname}</span>;
const page = (start) => render(
  <MemoryRouter initialEntries={[start]}>
    <SampleLinkGuard />
    <Where />
    <Routes>
      <Route path="*" element={<>
        <Link to="/rsvp/sample">אישור הגעה</Link>
        <Link to="/signup?ref=sample">בנו אתר כזה</Link>
        <Link to="/">נבנה עם</Link>
        <a href="https://waze.com/ul?q=x" target="_blank" rel="noopener">Waze</a>
      </>} />
    </Routes>
  </MemoryRouter>
);
const click = (name) => fireEvent.click(screen.getByRole("link", { name }));

describe("SampleLinkGuard", () => {
  it("on a sample page, a link to another sample page still works", () => {
    page("/invitation/sample");
    click("אישור הגעה");
    expect(screen.getByTestId("where").textContent).toBe("/rsvp/sample");
  });

  it("on a sample page, links out — signup, home, Waze — do nothing", () => {
    page("/invite/sample");
    click("בנו אתר כזה");
    click("נבנה עם");
    const waze = screen.getByRole("link", { name: "Waze" });
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    waze.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.getByTestId("where").textContent).toBe("/invite/sample");
  });

  it("on a REAL guest page nothing is blocked", () => {
    page("/invite/2f6c1d7e-1111-4222-8333-444455556666");
    click("בנו אתר כזה");
    expect(screen.getByTestId("where").textContent).toBe("/signup");
  });

  it("knows the sample guest pages and nothing else", () => {
    for (const p of ["/invitation/sample", "/invite/sample", "/rsvp/sample", "/gift/sample", "/gift/sample/wall", "/card/sample", "/save-the-date/sample", "/album/sample"])
      expect(SAMPLE_GUEST_PATH.test(p), p).toBe(true);
    for (const p of ["/", "/app", "/signup", "/sample-invitation", "/invite/sampler", "/invite/abc-sample"])
      expect(SAMPLE_GUEST_PATH.test(p), p).toBe(false);
  });
});

describe("DemoOnly", () => {
  it("on the sample: an example note, and every control inside disabled", () => {
    render(<DemoOnly demo what="מאשרים הגעה"><button type="button">כן</button><input aria-label="שם" /></DemoOnly>);
    expect(screen.getByRole("note").textContent).toMatch(/דוגמה/);
    expect(screen.getByRole("button", { name: "כן" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "שם" })).toBeDisabled();
  });

  it("for a real guest: the children alone, untouched", () => {
    const { container } = render(<DemoOnly demo={false} what="x"><button type="button">כן</button></DemoOnly>);
    expect(container.querySelector("fieldset")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.getByRole("button", { name: "כן" })).toBeEnabled();
  });
});
