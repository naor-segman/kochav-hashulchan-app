// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "../../test/dom.js";
import { DndContext } from "@dnd-kit/core";
import SeatSelect from "./SeatSelect.jsx";
import DraggableGuestRow from "./DraggableGuestRow.jsx";

// AX2 — in Chromium (Windows/Linux) ArrowDown on a closed <select> changes
// its value and fires `change` inside the keydown. The seating selects saved
// on `change`, so browsing the tables with the keyboard seated the guest at
// the first one. Measured in Chromium: keydown → change → setTimeout(0).
// jsdom does not run a select's keyboard default action, so the test does
// what Chromium does: keydown, then change, in the same task.

function setup(value = "") {
  const commit = vi.fn();
  const { container } = render(
    <SeatSelect value={value} onCommit={commit} aria-label="שולחן">
      <option value="">בחרו</option>
      <option value="t1">שולחן 1</option>
      <option value="t2">שולחן 2</option>
    </SeatSelect>,
  );
  const sel = container.querySelector("select");
  const arrowTo = (v) => { fireEvent.keyDown(sel, { key: "ArrowDown" }); fireEvent.change(sel, { target: { value: v } }); };
  return { sel, commit, arrowTo };
}

describe("SeatSelect — keyboard browsing does not save", () => {
  it("ArrowDown changes what is shown, not what is saved; Enter saves", () => {
    const { sel, commit, arrowTo } = setup();
    arrowTo("t1");
    arrowTo("t2");
    expect(commit).not.toHaveBeenCalled();
    expect(sel.value).toBe("t2");
    fireEvent.keyDown(sel, { key: "Enter" });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0]).toBe("t2");
  });

  it("leaving the select saves what it shows", () => {
    const { sel, commit, arrowTo } = setup();
    arrowTo("t1");
    fireEvent.blur(sel);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0]).toBe("t1");
  });

  it("Escape drops the browsed value", () => {
    const { sel, commit, arrowTo } = setup();
    arrowTo("t1");
    fireEvent.keyDown(sel, { key: "Escape" });
    fireEvent.blur(sel);
    expect(commit).not.toHaveBeenCalled();
    expect(sel.value).toBe("");
  });

  it("a choice not made by browsing keys — a click, the phone's picker — saves at once", () => {
    const { sel, commit } = setup();
    fireEvent.change(sel, { target: { value: "t2" } });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0]).toBe("t2");
  });

  it("a stale arrow key does not hold a later click", async () => {
    vi.useFakeTimers();
    try {
      const { sel, commit } = setup();
      fireEvent.keyDown(sel, { key: "ArrowDown" });   // e.g. opened the list on a Mac
      await act(async () => { vi.runAllTimers(); });
      fireEvent.change(sel, { target: { value: "t1" } });
      expect(commit).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("choosing the value already saved commits nothing", () => {
    const { sel, commit } = setup("t1");
    fireEvent.change(sel, { target: { value: "t1" } });
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("DraggableGuestRow — not a dead Tab stop", () => {
  it("the row is not focusable and has no button role (the select is the keyboard path)", () => {
    const { container } = render(
      <DndContext><DraggableGuestRow guestId="g1" className="r"><span>דנה</span><select aria-label="x" /></DraggableGuestRow></DndContext>,
    );
    const row = container.querySelector(".r");
    expect(row.hasAttribute("tabindex")).toBe(false);
    expect(row.getAttribute("role")).toBeNull();
  });
});
