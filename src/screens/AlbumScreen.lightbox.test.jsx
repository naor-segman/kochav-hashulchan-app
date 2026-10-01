// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent } from "../test/dom.js";

/* Fourth review 30.9 (AX7): the full-size photo said aria-modal and was not —
 * no Escape, focus left behind on the thumbnail, nowhere to return to. */

vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה" }),
  fetchAlbumPhotos: async () => [{ id: "p1", url: "https://x/p1.jpg", uploader: "יעל" }],
}));
const { default: AlbumScreen } = await import("./AlbumScreen.jsx");

describe("album lightbox", () => {
  it("opens with focus on close, closes on Escape, and gives focus back to the thumbnail", async () => {
    render(<MemoryRouter initialEntries={["/album/tok12345"]}><Routes>
      <Route path="/album/:token" element={<AlbumScreen />} />
    </Routes></MemoryRouter>);
    const thumbImg = await screen.findByRole("img", { hidden: true }).catch(() => null);
    const thumb = (thumbImg && thumbImg.closest("button")) || document.querySelector("button[class*='thumb']");
    thumb.focus();
    fireEvent.click(thumb);
    const dlg = screen.getByRole("dialog");
    expect(dlg.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(thumb);
  });
});
