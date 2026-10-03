// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";

/* 89 (1.10): the host's Excel button on the shared-table screen failed in
 * silence — the export rejected into nothing. */
vi.mock("../hooks/useAuth.js", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchCollabGuestsOwner: async () => [{ id: "r1", name: "דנה", phone: "0501234567", side: "bride", group: "משפחה", count: 1 }],
  subscribeCollabGuests: () => () => {},
}));
vi.mock("../utils/exportHelpers.js", async (orig) => ({
  ...(await orig()),
  exportCollabTableToExcel: vi.fn(async () => { throw new Error("chunk failed"); }),
}));
const { default: CollabReviewScreen } = await import("./CollabReviewScreen.jsx");

describe("shared table — Excel download that fails", () => {
  it("says so", async () => {
    const showToast = vi.fn();
    render(<MemoryRouter><CollabReviewScreen showToast={showToast} go={() => {}} patchEvent={() => {}}
      activeEvent={{ id: "e1", cloudId: "c1", name: "החתונה", type: "חתונה", guests: [], tables: [], seating: {}, constraints: [],
        tokens: { collab: "collab12345" }, collabActive: true }} /></MemoryRouter>);
    const btn = await screen.findByRole("button", { name: /הורדת הטבלה לאקסל/ });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    await act(async () => { fireEvent.click(btn); });
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/ההורדה לא הצליחה/), "err");
  });
});
