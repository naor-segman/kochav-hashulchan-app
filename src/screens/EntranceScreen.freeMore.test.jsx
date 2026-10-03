// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";
import EntranceScreen from "./EntranceScreen.jsx";

// WORKPLAN 114 (1.10): the door's free-seat strip drew eight tables and dropped the rest.
const tables = (n) => Array.from({ length: n }, (_, i) => ({ id: "t" + i, name: `שולחן ${i + 1}`, capacity: 10, shape: "round" }));
const mount = (n) => {
  localStorage.setItem("kochav_tour_v1", JSON.stringify({ entrance: 1 }));
  const EV = { id: "e1", name: "החתונה", cloudId: null, tokens: { hostess: "h1234567" }, tables: tables(n), seating: {},
    guests: [{ id: "g1", name: "דנה", count: 1, rsvp: "confirmed" }] };
  render(<AuthProvider><MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
    <Route path="/events/:eventId/entrance" element={<EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={() => {}} />} />
  </Routes></MemoryRouter></AuthProvider>);
  fireEvent.click(screen.getByRole("tab", { name: /לפי שולחן/ }));
};

describe("door — free seats", () => {
  it("counts the tables with room past the eight it shows", () => {
    mount(11);
    expect(screen.getByText("ועוד 3 שולחנות")).toBeTruthy();
  });
  it("eight or fewer: no count", () => {
    mount(8);
    expect(screen.queryByText(/ועוד \d+ שולחנות/)).toBeNull();
  });

  it("walk-in sheet: counts the tables with room past the twelve it shows", () => {
    mount(15);
    fireEvent.click(screen.getByRole("button", { name: /אורח שהגיע/ }));
    expect(screen.getByText(/ועוד 3 שולחנות עם מקום — מוצגים 12 עם הכי הרבה מקום/)).toBeTruthy();
  });
});
