// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "../test/dom.js";
import StartScreen from "./StartScreen.jsx";

/* Audit 3.10, P2-4: `autoFocus` on the first name field scrolled /start 596px
 * down on a 320×568 phone, past the hero. The page-level measurement is
 * qa/guestPages.mjs `start`; this pins the two decisions behind the fix. */

const pointer = (fine) => {
  window.matchMedia = vi.fn(q => ({ matches: q === "(pointer: fine)" ? fine : false, media: q, addEventListener() {}, removeEventListener() {} }));
};
afterEach(() => { delete window.matchMedia; vi.restoreAllMocks(); });

describe("StartScreen — the first field's focus", () => {
  it("with a mouse: focuses the first name field without scrolling the page", () => {
    pointer(true);
    const spy = vi.spyOn(HTMLInputElement.prototype, "focus");
    render(<StartScreen onStart={vi.fn()} />);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({ preventScroll: true });
    expect(document.activeElement.placeholder).toBe(spy.mock.contexts[0].placeholder);
  });

  it("on a touch screen: does not focus at all (no keyboard over the hero)", () => {
    pointer(false);
    const spy = vi.spyOn(HTMLInputElement.prototype, "focus");
    render(<StartScreen onStart={vi.fn()} />);
    expect(spy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it("no input carries autoFocus, which scrolls before any effect can stop it", () => {
    pointer(false);
    const { container } = render(<StartScreen onStart={vi.fn()} />);
    expect(document.activeElement).toBe(document.body);
    expect(container.querySelector("input[autofocus]")).toBeNull();
  });
});
