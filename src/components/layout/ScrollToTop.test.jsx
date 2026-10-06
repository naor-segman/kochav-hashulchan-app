// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { render, act } from "../../test/dom.js";
import ScrollToTop from "./ScrollToTop.jsx";

// Owner, 6.10: a service page opened in the middle — the window kept the home
// page's scroll across the route change.
// The navigate function handed out through a callback prop: a component may
// not write to anything outside itself (react-hooks lint).
const Grab = ({ onNav }) => { onNav(useNavigate()); return null; };
const ref = { nav: null };
const setup = () => render(
  <MemoryRouter initialEntries={["/home"]}><ScrollToTop /><Grab onNav={n => { ref.nav = n; }} /></MemoryRouter>
);

beforeEach(() => { window.scrollTo = vi.fn(); });

describe("ScrollToTop", () => {
  it("a new page opens at its top", () => {
    setup();
    window.scrollTo.mockClear();
    act(() => ref.nav("/services/seating"));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });

  it("not for a link to a section (#hash) — useHashScroll goes there", () => {
    setup();
    window.scrollTo.mockClear();
    act(() => ref.nav("/pricing#human"));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("not for Back — the browser returns the reader to where they were", () => {
    setup();
    act(() => ref.nav("/services/seating"));
    window.scrollTo.mockClear();
    act(() => ref.nav(-1));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("not when only the query changes on the same page", () => {
    setup();
    act(() => ref.nav("/services/seating"));
    window.scrollTo.mockClear();
    act(() => ref.nav("/services/seating?x=1"));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
