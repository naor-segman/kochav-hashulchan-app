// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act } from "../test/dom.js";

/* Sixth review 30.9 (סב90r): an upload still transferring when the page gave
 * up was reported as "no connection, try again" — and it landed anyway, so the
 * retry the guest was told to make added the photo twice. */
const calls = [];
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה" }),
  fetchAlbumPhotos: async () => [],
  uploadAlbumPhoto: (...a) => { calls.push(a); return new Promise(() => {}); },   // slow: never answers in time
}));
const { default: AlbumScreen } = await import("./AlbumScreen.jsx");
afterEach(() => vi.useRealTimers());

describe("a slow album upload", () => {
  it("says the line is slow, not down, and a second pick of the same photo uses the same key", async () => {
    vi.useFakeTimers();
    const { container } = render(<MemoryRouter initialEntries={["/album/tok12345"]}><Routes>
      <Route path="/album/:token" element={<AlbumScreen />} />
    </Routes></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "IMG_1.txt", { type: "text/plain", lastModified: 1_790_000_000_000 })   // jsdom cannot downscale a real image;
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(125_000); });
    expect(screen.getByText(/החיבור איטי מאוד/)).toBeTruthy();
    expect(screen.queryByText(/אין חיבור/)).toBeNull();
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); await vi.advanceTimersByTimeAsync(0); });
    expect(calls).toHaveLength(2);
    expect(calls[0][4]).toMatch(/^p-[a-z0-9]+$/);
    expect(calls[1][4]).toBe(calls[0][4]);
  });
});
