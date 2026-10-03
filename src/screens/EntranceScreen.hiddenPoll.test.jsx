// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, act } from "../test/dom.js";

/* ב7 — the host's door pulled the whole event every 25 seconds even with the
 * tab in the background. It pauses while hidden and pulls at once on return. */

const fetchGuests = vi.fn(async () => []);
vi.mock("../utils/cloudSync.js", async (orig) => ({
  ...(await orig()),
  fetchCloudEventGuests: (...a) => fetchGuests(...a),
}));
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));

const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

const EV = {
  id: "e1", name: "החתונה", cloudId: "c-1", tokens: { hostess: "h1234567" },
  tables: [], guests: [{ id: "g1", name: "יעל", count: 1, rsvp: "confirmed" }], seating: {},
};

let hidden = false;
Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
const setHidden = (h) => { hidden = h; document.dispatchEvent(new Event("visibilitychange")); };

afterEach(() => { vi.useRealTimers(); hidden = false; fetchGuests.mockClear(); });

describe("the host's door polls only while visible", () => {
  it("pauses when hidden, pulls at once and resumes when visible again", async () => {
    vi.useFakeTimers();
    localStorage.setItem("kochav_tour_v1", JSON.stringify({ entrance: 1 }));
    render(<MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
      <Route path="/events/:eventId/entrance" element={
        <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={vi.fn()} />} />
    </Routes></MemoryRouter>);

    expect(fetchGuests).toHaveBeenCalledTimes(1);               // on open
    await act(async () => { vi.advanceTimersByTime(25000); });
    expect(fetchGuests).toHaveBeenCalledTimes(2);

    await act(async () => { setHidden(true); });
    await act(async () => { vi.advanceTimersByTime(25000 * 4); });
    expect(fetchGuests).toHaveBeenCalledTimes(2);               // nothing while hidden

    await act(async () => { setHidden(false); });
    expect(fetchGuests).toHaveBeenCalledTimes(3);               // at once on return
    await act(async () => { vi.advanceTimersByTime(25000); });
    expect(fetchGuests).toHaveBeenCalledTimes(4);               // and the cadence resumes
  });

  it("opened in a background tab, it does not pull until shown", async () => {
    vi.useFakeTimers();
    hidden = true;
    render(<MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
      <Route path="/events/:eventId/entrance" element={
        <EntranceScreen mode="owner" events={[EV]} loading={false} patchEventById={vi.fn()} />} />
    </Routes></MemoryRouter>);
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(fetchGuests).not.toHaveBeenCalled();
    await act(async () => { setHidden(false); });
    expect(fetchGuests).toHaveBeenCalledTimes(1);
  });
});
