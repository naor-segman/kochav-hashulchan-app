// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "../test/dom.js";

// WORKPLAN 114 (1.10): the featured card drew eight tables and dropped the rest.
vi.mock("../hooks/useAuth.js", () => ({ useAuth: () => ({ user: null, loading: false }) }));
const { default: DashboardScreen } = await import("./DashboardScreen.jsx");
const tables = (n) => Array.from({ length: n }, (_, i) => ({ id: "t" + i, name: `שולחן ${i + 1}`, capacity: 10, shape: "round" }));
const open = (n, cloudCapped = false) => render(<MemoryRouter><DashboardScreen cloudCapped={cloudCapped}
  events={[{ id: "e1", name: "החתונה", type: "חתונה", guests: [], tables: tables(n), seating: {}, constraints: [] }]}
  isPaid={() => false} onStartEvent={() => {}} onNewEvent={() => {}} onOpenEvent={() => {}} onDeleteEvent={() => {}} onDuplicateEvent={() => {}} /></MemoryRouter>);

describe("dashboard — featured card", () => {
  it("counts the tables it did not draw", () => {
    open(11);
    expect(screen.getByText("+3")).toBeTruthy();
  });
  it("eight or fewer: no count", () => {
    open(8);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });
});

// WORKPLAN 115 (1.10): events past the cloud read's cap were not loaded, silently.
describe("dashboard — capped cloud read", () => {
  it("says older events were not loaded", () => {
    open(1, true);
    expect(screen.getByText(/אירועים ישנים יותר לא נטענו/)).toBeTruthy();
  });
  it("silent when everything was loaded", () => {
    open(1, false);
    expect(screen.queryByText(/לא נטענו/)).toBeNull();
  });
});
