// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "../../test/dom.js";
import CapBar from "./CapBar.jsx";
import styles from "./CapBar.module.css";

/**
 * CapBar is a 6px strip that has to say three different things — filling, full,
 * over — and both of the fixes in its history are invisible to a screenshot:
 *
 *   • --red sits ΔE 34 from the magenta ramp, so at 6px on a pale card the eye
 *     read "over capacity" and "still filling" as the same colour. Over gained
 *     a HATCH so the state survives a glance and a colour-blind viewer. A
 *     refactor that drops `backgroundImage` restores the original defect and
 *     changes nothing a reviewer would notice.
 *   • the `background` shorthand also resets background-image, so pairing it
 *     with `backgroundImage` in one style object made the hatch's existence
 *     depend on which key React wrote last. The component uses `backgroundColor`
 *     specifically to avoid that; nothing but a test holds it there.
 */

const fillOf = (container) => container.querySelector("." + styles.fill);

describe("CapBar", () => {
  it("is magenta while the table is still filling", () => {
    const { container } = render(<CapBar filled={4} capacity={10} />);
    const fill = fillOf(container);
    expect(fill.style.backgroundColor).toBe("var(--accent)");
    expect(fill.style.width).toBe("40%");
  });

  it("switches to the CTA colour at EXACTLY full", () => {
    // The celebratory beat. `>=`, not `===`: a table filled to 10 of 10 and a
    // table the seating engine filled to 10 of 10 in two passes are the same
    // fact, and an equality check would miss the second.
    const { container } = render(<CapBar filled={10} capacity={10} />);
    expect(fillOf(container).style.backgroundColor).toBe("var(--cta)");
  });

  it("marks over-capacity with a hatch as WELL as red — colour alone is not enough", () => {
    const { container } = render(<CapBar filled={13} capacity={10} isOver />);
    const fill = fillOf(container);
    expect(fill.style.backgroundColor).toBe("var(--red)");
    // The half of the signal that survives being glanced at.
    expect(fill.style.backgroundImage).toContain("repeating-linear-gradient");
    expect(fill.style.backgroundImage).not.toBe("none");
  });

  it("never sets the `background` shorthand alongside backgroundImage", () => {
    // The shorthand resets background-image. If someone "simplifies" the two
    // properties into one, the hatch's presence becomes render-order-dependent
    // and React warns on every rerender. Read the raw attribute, because
    // `style.background` is computed from the longhands and would pass anyway.
    const { container } = render(<CapBar filled={13} capacity={10} isOver />);
    const raw = fillOf(container).getAttribute("style");
    expect(raw).toContain("background-color");
    expect(raw).not.toMatch(/(^|;)\s*background:/);
  });

  it("clamps the bar at 100% instead of overflowing its track", () => {
    // 30 of 10 seats is a real state — the host overbooked. A 300%-wide child
    // escapes the rounded track and paints across the card.
    const { container } = render(<CapBar filled={30} capacity={10} isOver />);
    expect(fillOf(container).style.width).toBe("100%");
  });

  it("does not claim 'full' for a table with no capacity at all", () => {
    // 0/0 is a table the host has not sized yet. Without the `capacity > 0`
    // guard, `0 >= 0` is true and an unconfigured table renders as complete.
    const { container } = render(<CapBar filled={0} capacity={0} />);
    expect(fillOf(container).style.backgroundColor).toBe("var(--accent)");
  });

  it("carries real CSS Modules classes, not the string 'undefined'", () => {
    // Bug class 9. `.fill` losing its class is total: the bar has no height,
    // no radius and no transition, and renders as literally nothing.
    expect(styles.wrap).toBeTypeOf("string");
    expect(styles.fill).toBeTypeOf("string");
    const { container } = render(<CapBar filled={4} capacity={10} />);
    expect(container.firstChild.className).toBe(styles.wrap);
    expect(container.firstChild.firstChild.className).toBe(styles.fill);
    expect(container.innerHTML).not.toContain("undefined");
  });
});
