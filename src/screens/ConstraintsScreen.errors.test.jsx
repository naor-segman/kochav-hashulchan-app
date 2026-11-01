// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";
import ConstraintsScreen from "./ConstraintsScreen.jsx";

/* 136 stage D (31.10): a refused constraint says why under the form, marks
 * the picker it is about and puts the cursor there. It was four toasts. */
const ev = normalizeEvent({ id: "e1", name: "x", type: "חתונה",
  guests: [{ id: "g1", name: "דנה", side: "bride" }, { id: "g2", name: "יוסי", side: "groom" }],
  constraints: [{ id: "c1", type: "apart", guestA: "g1", guestB: "g2" }] });

const setup = () => {
  const patchEvent = vi.fn(), showToast = vi.fn();
  render(<MemoryRouter><ConstraintsScreen activeEvent={ev} patchEvent={patchEvent} go={() => {}} showToast={showToast} /></MemoryRouter>);
  const a = screen.getAllByRole("combobox", { name: "אורח א׳" })[0];
  const b = screen.getAllByRole("combobox", { name: "אורח ב׳" })[0];
  const add = () => fireEvent.click(screen.getByRole("button", { name: "הוסיפו" }));
  const pick = (input, name) => {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: name } });
    fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(name) }));
    fireEvent.click(screen.getByRole("option", { name: new RegExp(name) }));
  };
  return { patchEvent, showToast, a, b, add, pick };
};

describe("constraints — refused adds", () => {
  it("nobody picked: the first picker is marked and focused, no toast", () => {
    const { patchEvent, showToast, a, add } = setup();
    add();
    expect(patchEvent).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), "err");
    expect(screen.getByRole("alert").textContent).toBe("בחרו את האורח הראשון");
    expect(a.getAttribute("aria-invalid")).toBe("true");
    expect(a.getAttribute("aria-describedby")).toBe("cst-form-err");
    expect(document.activeElement).toBe(a);
  });

  it("the opposite rule already exists: both pickers are marked, and picking clears it", () => {
    const { patchEvent, a, b, add, pick } = setup();
    pick(a, "דנה");
    pick(b, "יוסי");
    add();   // the screen starts on "together"; the pair already has "apart"
    expect(patchEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/כבר יש אילוץ הפוך/);
    expect(a.getAttribute("aria-invalid")).toBe("true");
    expect(b.getAttribute("aria-invalid")).toBe("true");
    pick(b, "יוסי");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
