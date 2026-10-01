// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";

/* סב28 (second review, 29.9): deleting a paid event forfeits the purchase,
 * and the dialog said nothing about it. */
vi.mock("../hooks/useAuth.js", () => ({ useAuth: () => ({ user: null, loading: false }) }));
const { default: DashboardScreen } = await import("./DashboardScreen.jsx");
const EV = { id: "e1", name: "החתונה", type: "חתונה", guests: [], tables: [], seating: {}, constraints: [] };

const open = (paid) => {
  render(<MemoryRouter><DashboardScreen events={[EV]} isPaid={() => paid}
    onStartEvent={() => {}} onNewEvent={() => {}} onOpenEvent={() => {}} onDeleteEvent={() => {}} onDuplicateEvent={() => {}} /></MemoryRouter>);
  fireEvent.click(screen.getByTitle("מחקו אירוע"));
};

describe("deleting a paid event says what goes with it", () => {
  it("paid: the dialog says the package is lost", async () => {
    open(true);
    expect(await screen.findByText(/נרכשה חבילה.*תאבד עם המחיקה/)).toBeTruthy();
  });
  it("free: no package line", async () => {
    open(false);
    await screen.findByText(/למחוק לצמיתות/);
    expect(screen.queryByText(/נרכשה חבילה/)).toBeNull();
  });
});
