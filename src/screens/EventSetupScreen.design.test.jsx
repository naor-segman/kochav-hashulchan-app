// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../test/dom.js";
import EventSetupScreen from "./EventSetupScreen.jsx";

/* 136 stage D (31.10), event details: an empty name is said once, under the
 * field; the optional side names are folded unless the host already set one;
 * one way on to the next step, not two. */
const base = { id: "e1", name: "", type: "חתונה", date: "", venue: "", guests: [], tables: [] };
const mount = (ev = base) => {
  const showToast = vi.fn(), go = vi.fn(), patchEvent = vi.fn();
  render(<EventSetupScreen activeEvent={ev} patchEvent={patchEvent} go={go} showToast={showToast} />);
  return { showToast, go, patchEvent };
};

describe("EventSetupScreen — the new design", () => {
  it("an empty name: the line under the field, the field marked and focused — no toast", () => {
    const { showToast, go } = mount();
    fireEvent.click(screen.getByRole("button", { name: /שמרו והמשיכו/ }));
    expect(go).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), "err");
    const input = screen.getByLabelText(/שם האירוע/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")).textContent).toBe("יש להזין שם לאירוע");
    expect(document.activeElement).toBe(input);
  });

  it("the side names are folded for a new event, and open when one is set", () => {
    mount();
    expect(document.querySelector('[data-tour="setup.sides"]').tagName).toBe("DETAILS");
    expect(document.querySelector('[data-tour="setup.sides"]').open).toBe(false);
  });

  it("…open when the host already named a side", () => {
    mount({ ...base, name: "x", sideLabels: { bride: "המשפחה של דנה", groom: "" } });
    expect(document.querySelector('[data-tour="setup.sides"]').open).toBe(true);
  });

  it("one button on to the next step", () => {
    mount({ ...base, name: "x" });
    expect(screen.getAllByRole("button", { name: /המשיכו ל/ })).toHaveLength(1);
  });
});
