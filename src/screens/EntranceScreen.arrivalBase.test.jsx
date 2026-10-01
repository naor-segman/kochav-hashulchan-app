// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";
import { syncBaseOf } from "../utils/syncBase.js";

/* ב1/ב8 at the host's door: the overlay of the greeter's marks merged by
 * "newest stamp wins", so the host's tap on the second child and the
 * greeter's tap on the mother — one family, inside one 25s window — kept only
 * one of them (and a fast host clock decided which). With the last-synced
 * base both survive. ו2: the greeter's own taps were written as "מארח". */

const fetchGuests = vi.fn();
vi.mock("../utils/cloudSync.js", async (orig) => ({ ...(await orig()), fetchCloudEventGuests: (...a) => fetchGuests(...a) }));
const mark = vi.fn(async () => {});
vi.mock("../utils/publicTokens.js", () => ({
  fetchHostessData: vi.fn(async () => ({
    cloudId: "c1", name: "החתונה", writesOpen: true,
    guests: [{ id: "g1", name: "יעל כהן", count: 1 }], tables: [], seating: {},
  })),
  markArrivalByToken: (...a) => mark(...a),
}));
vi.mock("../hooks/useAuth.js", () => ({
  useAuth: () => ({ user: { id: "u1" }, loading: false }),
  AuthProvider: ({ children }) => children,
}));
const arrival = await import("../utils/arrival.js");
const writers = vi.hoisted(() => ({ by: [] }));
vi.mock("../utils/arrival.js", async (orig) => {
  const real = await orig();
  return { ...real, setRowArrived: (g, on, by) => { writers.by.push(by); return real.setRowArrived(g, on, by); } };
});
const { default: EntranceScreen } = await import("./EntranceScreen.jsx");

const T = 1_800_000_000_000;
const fam = { id: "g1", name: "דן לוי", count: 2, rsvp: "confirmed", companions: ["נועה"] };
const BASE_EV = { id: "e1", name: "החתונה", cloudId: "c1", tables: [], seating: {}, guests: [fam], tokens: { hostess: "h1234567" } };

beforeEach(() => { localStorage.setItem("kochav_orientation_v1", "1"); sessionStorage.clear(); writers.by.length = 0; mark.mockClear(); });

describe("the host's door merges the greeter's marks against the base", () => {
  it("host marked נועה (newer clock), greeter marked דן: both are in", async () => {
    const local = { ...BASE_EV, syncBase: syncBaseOf(BASE_EV),
      guests: [arrival.withArrivedSeats(fam, [1], T + 180000)] };     // host, clock 3 min ahead
    fetchGuests.mockResolvedValue([arrival.withArrivedSeats(fam, [0], T, null)]);  // greeter
    render(<MemoryRouter initialEntries={["/events/e1/entrance"]}><Routes>
      <Route path="/events/:eventId/entrance" element={
        <EntranceScreen mode="owner" events={[local]} loading={false} patchEventById={vi.fn()} />} />
    </Routes></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("חיפוש אורח"), { target: { value: "דן" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /^כל 2 הגיעו — דן לוי/ })).toBeInTheDocument());
  });
});

describe("who marked it", () => {
  it("a tap on the greeter's link is written as the greeter's, not \"מארח\"", async () => {
    render(<MemoryRouter initialEntries={["/entrance/tok12345678"]}><Routes>
      <Route path="/entrance/:token" element={<EntranceScreen mode="token" />} />
    </Routes></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("חיפוש אורח"), { target: { value: "יעל" } });
    fireEvent.click(screen.getByRole("button", { name: /^הגיע\/ה/ }));
    await waitFor(() => expect(mark).toHaveBeenCalled());
    expect(writers.by).toEqual(["דיילת"]);
  });
});
