// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, act } from "../test/dom.js";

/* Fifth review 30.9: the host closed the family table's link; the next poll
 * answered [] and the relative saw an empty table, then was told to check
 * their connection when adding a row. */
let open = true;
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchCollabEvent: async () => (open ? { cloudId: "c1", name: "החתונה", type: "חתונה" } : null),
  fetchCollabGuests: async () => (open ? [{ id: "r1", name: "משפחת כהן", phone: "", side: "bride", guest_group: "משפחה", guests_count: 1, companions: [] }] : []),
  upsertCollabGuest: async () => {}, deleteCollabGuest: async () => {},
}));
const { default: CollabScreen } = await import("./CollabScreen.jsx");
afterEach(() => vi.useRealTimers());

describe("the host closes the family table's link", () => {
  it("says the link is not active instead of showing an empty table", async () => {
    vi.useFakeTimers();
    render(<MemoryRouter initialEntries={["/collab/tok12345"]}><Routes>
      <Route path="/collab/:token" element={<CollabScreen />} />
    </Routes></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByDisplayValue("משפחת כהן")).toBeTruthy();
    open = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(screen.getByText("הקישור אינו פעיל")).toBeTruthy();
  });
});
