// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, within } from "../test/dom.js";
import { normalizeEvent } from "../utils/eventHelpers.js";
import ConstraintsScreen from "./ConstraintsScreen.jsx";

/* AX3: the guest picker in ConstraintsScreen.
 *  - it was a textbox with a role=listbox beside it and nothing joining them,
 *    so arrowing through names announced nothing;
 *  - options only listened to mousedown, which a screen reader's activation
 *    (a click) never sends — choosing a guest was impossible without a mouse
 *    or the arrow keys;
 *  - "no results" and "N more" sat INSIDE the listbox, read as options. */

const ev = normalizeEvent({ id: "e1", name: "x", type: "חתונה",
  guests: Array.from({ length: 12 }, (_, i) => ({ id: "g" + i, name: `כהן ${i + 1}`, side: "bride" })) });

const setup = () => {
  const patchEvent = vi.fn();
  render(<MemoryRouter><ConstraintsScreen activeEvent={ev} patchEvent={patchEvent} go={() => {}} showToast={() => {}} /></MemoryRouter>);
  const input = screen.getAllByRole("combobox", { name: "אורח א׳" })[0];
  fireEvent.focus(input);
  return { input, patchEvent };
};

describe("ConstraintsScreen guest picker is a combobox (AX3)", () => {
  it("the input controls the listbox and names the highlighted option", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "כהן" } });
    const listbox = document.getElementById(input.getAttribute("aria-controls"));
    expect(listbox).toHaveAttribute("role", "listbox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).not.toHaveAttribute("aria-activedescendant");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = document.getElementById(input.getAttribute("aria-activedescendant"));
    expect(active).toHaveAttribute("role", "option");
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(listbox.contains(active)).toBe(true);
    expect(active).toBe(screen.getAllByRole("option")[1]);
  });

  it("an option is chosen by a click alone (no mousedown)", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "כהן 3" } });
    fireEvent.click(screen.getByRole("option", { name: /כהן 3/ }));
    expect(input.value).toBe("כהן 3");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("mousedown on an option does not take the focus out of the input", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "כהן" } });
    const opt = screen.getAllByRole("option")[0];
    expect(fireEvent.mouseDown(opt)).toBe(false); // default prevented
  });

  it("status rows are outside the listbox; every child of it is an option", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "כהן" } });
    const listbox = document.getElementById(input.getAttribute("aria-controls"));
    expect(screen.getByText(/ועוד 2/)).toBeTruthy();
    expect(listbox.contains(screen.getByText(/ועוד 2/))).toBe(false);
    expect([...listbox.children].every(c => c.getAttribute("role") === "option")).toBe(true);

    fireEvent.change(input, { target: { value: "לוי" } });
    const none = screen.getByText(/אין תוצאות/);
    expect(listbox.contains(none)).toBe(false);
    expect(within(listbox).queryAllByRole("option")).toHaveLength(0);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
