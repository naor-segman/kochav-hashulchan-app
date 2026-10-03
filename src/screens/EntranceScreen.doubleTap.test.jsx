// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";

/* RG5 — the double-tap guard (סב24) recorded IGNORED taps as well, so a run of
 * taps kept its 600ms window open: the third tap, 900ms after the one that
 * counted, was swallowed too. And the by-table "כולם" button had the guard
 * with no test at all. */

vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

const EV = {
  id: "e1", name: "החתונה", cloudId: null, tokens: { hostess: "h1234567" },
  tables: [{ id: "t1", name: "שולחן 1", capacity: 10, shape: "round" }],
  guests: [{ id: "g1", name: "יעל", count: 1, rsvp: "confirmed" }, { id: "g2", name: "דן", count: 2, rsvp: "confirmed" }],
  seating: { g1: "t1", g2: "t1" },
};

afterEach(() => vi.useRealTimers());

function open() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-06-01T19:00:00"));
  localStorage.setItem("kochav_tour_v1", JSON.stringify({ entrance: 1 }));
  const patch = vi.fn();
  render(<MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
    <Route path="/events/:eventId/entrance" element={
      <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={patch} />} />
  </Routes></MemoryRouter>);
  return patch;
}
const later = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); }); };

describe("double-tap guard", () => {
  it("a row: tap, tap at 400ms (ignored), tap at 900ms — the third one counts", async () => {
    const patch = open();
    fireEvent.change(screen.getByLabelText("חיפוש אורח"), { target: { value: "יעל" } });
    const btn = () => screen.getByRole("button", { name: "הגיע/ה — יעל" });
    fireEvent.click(btn());
    expect(patch).toHaveBeenCalledTimes(1);
    await later(400);
    fireEvent.click(btn());
    expect(patch).toHaveBeenCalledTimes(1);          // a double tap
    await later(500);
    fireEvent.click(btn());
    expect(patch).toHaveBeenCalledTimes(2);          // 900ms after the applied one
  });

  it("the table's 'כולם' button: a second tap inside 600ms is ignored, after it counts", async () => {
    const patch = open();
    fireEvent.click(screen.getByRole("tab", { name: /לפי שולחן/ }));
    const all = () => screen.getByRole("button", { name: "כולם הגיעו — שולחן 1" });   // EV is static: it stays "כולם"
    fireEvent.click(all());
    expect(patch).toHaveBeenCalledTimes(1);
    await later(200);
    fireEvent.click(all());
    expect(patch).toHaveBeenCalledTimes(1);
    await later(700);
    fireEvent.click(all());
    expect(patch).toHaveBeenCalledTimes(2);
    // and what it wrote: every seat of every non-declined row at the table
    const out = patch.mock.calls[0][1](EV);
    expect(out.guests.map(g => g.arrivedSeats)).toEqual([[0], [0, 1]]);
  });
});
