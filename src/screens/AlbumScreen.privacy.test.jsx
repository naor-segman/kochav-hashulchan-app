// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render, screen, fireEvent, act, waitFor } from "../test/dom.js";

/* Album privacy (W1 item 1 / 36d): what reaches uploadAlbumPhoto must be the
 * re-encoded bytes — never the File the guest picked, which carries EXIF/GPS. */
const uploads = [];
let compress;
vi.mock("../lib/supabase.js", async (orig) => ({ ...(await orig()), isSupabaseConfigured: true }));
vi.mock("../utils/imageCompress.js", () => ({ compressImage: (...a) => compress(...a) }));
vi.mock("../utils/publicTokens.js", async (orig) => ({
  ...(await orig()),
  fetchEventByToken: async () => ({ cloudId: "c1", name: "החתונה", type: "חתונה" }),
  fetchAlbumPhotos: async () => [],
  uploadAlbumPhoto: async (...a) => { uploads.push(a); return "c1/tok/x.webp"; },
}));
const { default: AlbumScreen } = await import("./AlbumScreen.jsx");

const mount = () => render(<MemoryRouter initialEntries={["/album/tok12345"]}><Routes>
  <Route path="/album/:token" element={<AlbumScreen />} />
</Routes></MemoryRouter>);

beforeEach(() => { uploads.length = 0; });

describe("album upload privacy", () => {
  it("uploads the re-encoded blob of a small JPEG, not the original file", async () => {
    const fresh = new Blob(["re-encoded"], { type: "image/webp" });
    compress = vi.fn(async () => ({ blob: fresh, ext: "webp" }));
    const { container } = mount();
    const input = await waitFor(() => { const i = container.querySelector('input[type="file"]'); if (!i) throw 0; return i; });
    expect(input.getAttribute("accept")).not.toBe("image/*");
    const file = new File(["small original"], "IMG_1.jpg", { type: "image/jpeg" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    await waitFor(() => expect(uploads).toHaveLength(1), { timeout: 1000 });
    expect(uploads[0][2]).toBe(fresh);
  });

  it("does not upload an HEIC the browser cannot decode, and says why", async () => {
    compress = vi.fn(async () => { throw new Error("image decode failed"); });
    const { container } = mount();
    const input = await waitFor(() => { const i = container.querySelector('input[type="file"]'); if (!i) throw 0; return i; });
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["h"], "IMG.HEIC", { type: "image/heic" })] } }); });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/HEIC/), { timeout: 1000 });
    expect(uploads).toHaveLength(0);
  });

  it("does not upload a type the bucket refuses (a GIF went up raw)", async () => {
    compress = vi.fn();
    const { container } = mount();
    const input = await waitFor(() => { const i = container.querySelector('input[type="file"]'); if (!i) throw 0; return i; });
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["g"], "a.gif", { type: "image/gif" })] } }); });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy(), { timeout: 1000 });
    expect(uploads).toHaveLength(0);
  });
});
