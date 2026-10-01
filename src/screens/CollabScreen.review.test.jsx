// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "../test/dom.js";

/* סב36 (second review, 29.9), the shared family table:
 *  - a failed delete was silent: the row vanished, then came back on the next
 *    poll with no word why;
 *  - the seats picker stopped at 20 while the host's own form allows 50, so a
 *    row of 25 showed "1 מקום" beside 24 companion boxes;
 *  - the three selects had no accessible name. */
const del = vi.fn(async () => { throw new Error("offline"); });
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchCollabEvent: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה", brideName: "דנה", groomName: "יוסי" }),
  fetchCollabGuests: async () => [{ id: "r1", name: "משפחת כהן", phone: "", side: "bride", guest_group: "משפחה", guests_count: 25, companions: [] }],
  deleteCollabGuest: (...a) => del(...a),
  upsertCollabGuest: async () => {},
}));
const { default: CollabScreen } = await import("./CollabScreen.jsx");
const open = () => render(<MemoryRouter initialEntries={["/collab/tok12345"]}><Routes>
  <Route path="/collab/:token" element={<CollabScreen />} />
</Routes></MemoryRouter>);

describe("shared family table", () => {
  it("a row of 25 seats shows 25, and the selects are named", async () => {
    open();
    const seats = await screen.findByLabelText("מספר מקומות");
    expect(seats.value).toBe("25");
    expect(screen.getByLabelText("צד")).toBeTruthy();
    expect(screen.getByLabelText("קבוצה")).toBeTruthy();
  });

  it("a delete that fails puts the row back and says so", async () => {
    open();
    await screen.findByDisplayValue("משפחת כהן");
    fireEvent.click(screen.getByLabelText("מחיקת שורה"));
    await waitFor(() => expect(del).toHaveBeenCalled());
    expect(await screen.findByText(/המחיקה של משפחת כהן לא נשמרה/)).toBeTruthy();
    expect(screen.getByDisplayValue("משפחת כהן")).toBeTruthy();
  });
});
