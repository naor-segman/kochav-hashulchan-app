// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";

/* 107 (29.9): a walk-in table chosen for a party of two stayed selected after
 * the count went up to four, and the family was seated with no room. */

const EV = {
  id: "e1", name: "החתונה", cloudId: null, tokens: { hostess: "h1234567" },
  tables: [{ id: "t1", name: "1", capacity: 4, type: "regular", shape: "round" }],
  guests: [{ id: "g1", name: "יעל", count: 2, rsvp: "confirmed" }],   // t1: 2 of 4 taken
  seating: { g1: "t1" },
};
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

const addWalkIn = (clicksUp) => {
  const patchEventById = vi.fn();
  localStorage.setItem("kochav_orientation_v1", "1");
  render(<AuthProvider><MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
    <Route path="/events/:eventId/entrance" element={
      <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={patchEventById} />} />
  </Routes></MemoryRouter></AuthProvider>);
  fireEvent.click(screen.getByRole("button", { name: /אורח שהגיע/ }));
  fireEvent.change(screen.getByPlaceholderText("שם מלא"), { target: { value: "משפחת לוי" } });
  fireEvent.click(screen.getByRole("button", { name: /2 פנויים/ }));          // t1, chosen for 1
  for (let i = 0; i < clicksUp; i++) fireEvent.click(screen.getByRole("button", { name: "עוד" }));
  fireEvent.click(screen.getByRole("button", { name: /^הוסיפו/ }));
  const [, fn] = patchEventById.mock.calls.at(-1);
  const out = fn(EV);
  return out.seating[out.guests.at(-1).id];
};

describe("walk-in table", () => {
  it("seats the party when the table still has room", () => {
    expect(addWalkIn(1)).toBe("t1");                  // 2 people, 2 free
  });
  it("does not seat a party that no longer fits the chosen table", () => {
    expect(addWalkIn(3)).toBeUndefined();             // 4 people, 2 free
  });
});

// Fourth review 30.9 (AX8): no Escape, and closing left focus nowhere.
describe("walk-in sheet keyboard", () => {
  it("Escape closes it and focus returns to the button that opened it", () => {
    localStorage.setItem("kochav_orientation_v1", "1");
    render(<AuthProvider><MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
      <Route path="/events/:eventId/entrance" element={
        <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={vi.fn()} />} />
    </Routes></MemoryRouter></AuthProvider>);
    const open = screen.getByRole("button", { name: /אורח שהגיע/ });
    open.focus();
    fireEvent.click(open);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
  });
});
