// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "../../test/dom.js";
import Toast from "./Toast.jsx";

/* סב54: the toast had no role and was mounted only while it showed, so no
 * confirmation or error was ever announced. */
describe("Toast is a live region that is always there", () => {
  it("renders the region with no message, and the message inside it", () => {
    const { container, rerender } = render(<Toast />);
    const region = container.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region.textContent).toBe("");
    rerender(<Toast msg="טל כהן נוסף/ה לרשימה ✓" />);
    expect(container.querySelector('[role="status"]')).toBe(region);   // the same node, so the change is announced
    expect(region.textContent).toContain("טל כהן");
    expect(region.getAttribute("aria-live")).toBe("polite");
  });
  it("an error interrupts", () => {
    const { container } = render(<Toast msg="לא נשמר" variant="err" />);
    expect(container.querySelector('[role="status"]').getAttribute("aria-live")).toBe("assertive");
  });
});
