// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act, waitFor } from "../test/dom.js";

/* 36i: a photo list that failed to load was shown as an empty album —
 * "עדיין אין תמונות — תהיו הראשונים" — with no way to try again. */
let fails = 1;
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה" }),
  fetchAlbumPhotos: async () => {
    if (fails-- > 0) throw new Error("Failed to fetch");
    return [{ id: "p1", url: "https://x/p1.jpg", uploader: "יעל" }];
  },
}));
const { default: AlbumScreen } = await import("./AlbumScreen.jsx");

describe("album list that fails to load", () => {
  it("says so instead of 'no photos yet', and a retry loads them", async () => {
    render(<MemoryRouter initialEntries={["/album/tok12345"]}><Routes>
      <Route path="/album/:token" element={<AlbumScreen />} />
    </Routes></MemoryRouter>);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/לא הצלחנו לטעון/);
    expect(screen.queryByText(/עדיין אין תמונות/)).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "נסו שוב" })); });
    await waitFor(() => expect(screen.getByText("תמונה אחת")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
