// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";

/* Fifth review 30.9: an upload that never answered left the album on
 * "מעלה… (1 נותרו)" for good, the picker disabled, no way out. */
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה" }),
  fetchAlbumPhotos: async () => [],
  uploadAlbumPhoto: () => new Promise(() => {}),          // never answers
}));
// jsdom has no canvas: the re-encode is stubbed, the bytes it returns are new.
vi.mock("../utils/imageCompress.js", () => ({
  compressImage: async () => ({ blob: new Blob(["re-encoded"], { type: "image/webp" }), ext: "webp" }),
}));
const { default: AlbumScreen } = await import("./AlbumScreen.jsx");
afterEach(() => vi.useRealTimers());

describe("a hung album upload", () => {
  it("gives up after its deadline and frees the page", async () => {
    vi.useFakeTimers();
    const { container } = render(<MemoryRouter initialEntries={["/album/tok12345"]}><Routes>
      <Route path="/album/:token" element={<AlbumScreen />} />
    </Routes></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(125_000); });
    expect(screen.getByText(/תמונה אחת לא הועלתה/)).toBeTruthy();
    expect(input.disabled).toBe(false);
  });
});
