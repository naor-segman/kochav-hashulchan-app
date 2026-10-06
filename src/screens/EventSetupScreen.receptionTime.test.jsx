// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../test/dom.js";
import EventSetupScreen from "./EventSetupScreen.jsx";

/* 137 (owner, 6.10): "שעת קבלת פנים" decides the Hebrew date the guests see.
 * Review 6.10: the input sat in a wrapper div, so its label pointed at the
 * div and the field had no accessible name. */
const ev = { id: "e1", name: "החתונה", type: "חתונה", date: "2026-10-06", venue: "", guests: [], tables: [] };

describe("EventSetupScreen — reception time", () => {
  it("is a labelled field, described by the Hebrew date it gives", () => {
    render(<EventSetupScreen activeEvent={ev} patchEvent={vi.fn()} go={() => {}} showToast={vi.fn()} />);
    const input = screen.getByLabelText(/שעת קבלת פנים/);
    expect(input.getAttribute("type")).toBe("time");
    const line = document.getElementById(input.getAttribute("aria-describedby"));
    expect(line.textContent).toMatch(/כ״ה בתשרי תשפ״ז/);
    fireEvent.change(input, { target: { value: "19:30" } });
    expect(line.textContent).toMatch(/כ״ו בתשרי תשפ״ז \(אחרי השקיעה\)/);
  });

  it("is saved with the event when the screen is left", () => {
    const patchEvent = vi.fn();
    const { unmount } = render(<EventSetupScreen activeEvent={ev} patchEvent={patchEvent} go={() => {}} showToast={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/שעת קבלת פנים/), { target: { value: "19:30" } });
    unmount();
    expect(patchEvent.mock.calls[0][0].receptionTime).toBe("19:30");
  });
});
