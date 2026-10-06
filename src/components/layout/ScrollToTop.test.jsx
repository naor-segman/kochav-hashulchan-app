// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { render, act } from "../../test/dom.js";
import ScrollToTop from "./ScrollToTop.jsx";

// Owner, 6.10: a service page opened in the middle — the window kept the home
// page's scroll across the route change.
// A holder object, not a reassigned outer `let` (react-hooks lint).
const ref = { nav: null };
const Grab = () => { ref.nav = useNavigate(); return null; };
const setup = () => render(
  <MemoryRouter initialEntries={["/home"]}><ScrollToTop /><Grab /></MemoryRouter>
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
