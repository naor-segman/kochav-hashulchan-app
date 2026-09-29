// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../test/dom.js";
import EventSetupScreen from "./EventSetupScreen.jsx";

/* E4 (third review 30.9): the only screen that does not save as you type, and
 * leaving it through the nav kept nothing — no prompt, nothing in storage. */

const ev = { id: "e1", name: "החתונה של נוי ועידו", type: "חתונה", date: "", venue: "", guests: [], tables: [] };
const setup = () => {
  const patchEvent = vi.fn();
  const showToast = vi.fn();
  const r = render(<EventSetupScreen activeEvent={ev} patchEvent={patchEvent} go={() => {}} showToast={showToast} />);
  const venue = screen.getByPlaceholderText("לדוגמה: אולמי גן עדן, תל אביב");
  return { ...r, patchEvent, showToast, venue };
};

describe("EventSetupScreen — leaving with unsaved edits (E4)", () => {
  it("saves what was typed when the screen is left", () => {
    const { unmount, patchEvent, venue } = setup();
    fireEvent.change(venue, { target: { value: "אולם בהרצליה" } });
    expect(patchEvent).not.toHaveBeenCalled();
    unmount();
    expect(patchEvent).toHaveBeenCalledTimes(1);
    expect(patchEvent.mock.calls[0][0].venue).toBe("אולם בהרצליה");
  });

  it("a blank name on leave keeps the event's current name", () => {
    const { unmount, patchEvent, venue } = setup();
    fireEvent.change(venue, { target: { value: "בית" } });
    fireEvent.change(screen.getByDisplayValue(ev.name), { target: { value: "  " } });
    unmount();
    expect(patchEvent.mock.calls[0][0]).toMatchObject({ name: ev.name, venue: "בית" });
  });

  it("nothing is written when nothing was changed, and a save is not repeated on leave", () => {
    const a = setup();
    a.unmount();
    expect(a.patchEvent).not.toHaveBeenCalled();

    const b = setup();
    fireEvent.change(b.venue, { target: { value: "גן" } });
    fireEvent.click(screen.getByRole("button", { name: "שמרו בלבד" }));
    b.unmount();
    expect(b.patchEvent).toHaveBeenCalledTimes(1);
  });

  it("closing the tab with edits pending asks first", () => {
    const { venue } = setup();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    fireEvent.change(venue, { target: { value: "x" } });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
