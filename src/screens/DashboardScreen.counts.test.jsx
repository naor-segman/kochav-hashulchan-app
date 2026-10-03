// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, cleanup } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";

/* audit 3.10, V10. The same event read "150 רשומות" on its dashboard card and
 * "138 רשומות" on its own map one click later: the card counted every row,
 * the map (and the seating screen, and the health line) leaves out the
 * declined. One definition — the map's. Rendered on both screens and compared,
 * so the two cannot drift apart again by either side changing alone. */

const { default: DashboardScreen } = await import("./DashboardScreen.jsx");
const { default: EventHubScreen }  = await import("./EventHubScreen.jsx");

// 5 rows, 2 of them declined; mixed counts so rows ≠ seats.
const EV = {
  id: "e1", name: "החתונה של דנה ויוסי", type: "חתונה", date: "", venue: "",
  guests: [
    { id: "g1", name: "א", count: 3, rsvp: "confirmed" },
    { id: "g2", name: "ב", count: 1, rsvp: "declined" },
    { id: "g3", name: "ג", count: 2, rsvp: "pending" },
    { id: "g4", name: "ד", count: 4, rsvp: "declined" },
    { id: "g5", name: "ה", count: 1 },
  ],
  tables: [{ id: "t1", name: "1", capacity: 10, shape: "round" }],
  seating: {}, constraints: [], tasks: [], vendors: [],
};

const rowsOn = (ui) => {
  const { container } = render(<AuthProvider><MemoryRouter>{ui}</MemoryRouter></AuthProvider>);
  const m = container.textContent.match(/(\d+) רשומות/);
  cleanup();
  return m ? Number(m[1]) : null;
};

describe("one guest-row count across the dashboard and the event map (audit 3.10, V10)", () => {
  it("both leave out the declined", () => {
    const dash = rowsOn(<DashboardScreen events={[EV]} isPaid={() => false}
      onStartEvent={() => {}} onNewEvent={() => {}} onOpenEvent={() => {}} onDeleteEvent={() => {}} onDuplicateEvent={() => {}} />);
    const hub = rowsOn(<EventHubScreen activeEvent={EV} go={vi.fn()} showToast={vi.fn()} />);
    expect(hub).toBe(3);
    expect(dash).toBe(hub);
  });
});
