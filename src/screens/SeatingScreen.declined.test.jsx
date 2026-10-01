// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, act } from "../test/dom.js";

// RG10c — a guest who declined after being seated (data from before סב7)
// is still listed at the table. They hold no chair: the export and
// seatingTotals skip them. The card's "X/Y" and the venue printout counted
// them, so a table of 2 with two coming and a declined pair read "4/2" in red
// on screen while the Excel export listed it as fitting — and the printout
// sent their names to the venue staff.

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1", email: "host@example.com" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const SeatingScreen = (await import("./SeatingScreen.jsx")).default;

const EVENT = {
  id: "e1", name: "אירוע", type: "חתונה", date: "2027-06-01",
  guests: [
    { id: "a", name: "אורית אלון", rsvp: "confirmed", count: 1 },
    { id: "b", name: "בני ברק", rsvp: "confirmed", count: 1 },
    { id: "d", name: "דוד דהן", rsvp: "declined", count: 2 },
  ],
  tables: [{ id: "t1", name: "שולחן 1", capacity: 2 }],
  seating: { a: "t1", b: "t1", d: "t1" },
  constraints: [], lockedGuests: [], lockedTables: [],
};

describe("SeatingScreen — a declined guest still at a table holds no chair", () => {
  it("counts 2/2 on the card and in print, and prints only who is coming", () => {
    const { container } = render(
      <MemoryRouter><SeatingScreen activeEvent={EVENT} patchEvent={() => {}} go={() => {}} showToast={() => {}} /></MemoryRouter>,
    );
    const screen = container.textContent;
    expect(screen).not.toMatch(/4\/2/);
    expect(screen).toMatch(/2\/2/);
    // The print layouts mount on the browser's own beforeprint.
    act(() => { window.dispatchEvent(new Event("beforeprint")); });
    const view = container.querySelector("[data-print-mode]");
    expect(view).not.toBeNull();
    const printed = view.textContent;
    expect(printed).toContain("אורית אלון");
    expect(printed).not.toContain("דוד דהן");
    expect(printed).not.toMatch(/4\/2/);
  });
});
