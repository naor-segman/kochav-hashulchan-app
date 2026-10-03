// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen } from "../test/dom.js";
import { AuthProvider } from "../hooks/useAuth.js";

/* Third review 30.9 (E8): the door counter read "1 משפחות הגיעו חלקית". */

const { default: EntranceScreen } = await import("./EntranceScreen.jsx");
const mount = (guests) => {
  localStorage.setItem("kochav_tour_v1", JSON.stringify({ entrance: 1 }));
  const EV = { id: "e1", name: "החתונה", cloudId: null, tokens: { hostess: "h1234567" }, tables: [], seating: {}, guests };
  render(<AuthProvider><MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
    <Route path="/events/:eventId/entrance" element={
      <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={() => {}} />} />
  </Routes></MemoryRouter></AuthProvider>);
};
const partly = (id) => ({ id, name: "משפחה " + id, count: 3, rsvp: "confirmed", arrivedSeats: [0], arrived: true });

describe("door counter, singular and plural", () => {
  it("one family", () => {
    mount([partly("a")]);
    expect(screen.getByText("משפחה אחת הגיעה חלקית")).toBeTruthy();
  });
  it("two families", () => {
    mount([partly("a"), partly("b")]);
    expect(screen.getByText("2 משפחות הגיעו חלקית")).toBeTruthy();
  });

  // Fifth review 30.9 (סב88): the empty search read "1 אורחים כבר בפנים".
  it("one guest inside", () => {
    mount([{ id: "s", name: "יחיד", count: 1, rsvp: "confirmed", arrivedSeats: [0], arrived: true }]);
    expect(screen.getByText("אורח אחד כבר בפנים")).toBeTruthy();
  });
});
