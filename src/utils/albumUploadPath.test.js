import { describe, it, expect, vi } from "vitest";

/* סב42 (third review, 30.9): the storage policy now admits an album file only
 * at <event id>/<CURRENT album token>/<file>, and album_add_photo checks the
 * same prefix (migration 20260930000000). If the client builds any other path,
 * every guest upload fails — this pins the two halves together. */
const uploads = [];
let lastOpts = null;
const rpc = vi.fn(async () => ({ data: "row-1", error: null }));
vi.mock("../lib/supabase.js", () => ({
  supabase: {
    rpc: (...a) => rpc(...a),
    storage: { from: () => ({
      upload: async (path, _body, opts) => { uploads.push(path); lastOpts = opts; return { data: { path }, error: null }; },
      remove: async () => ({ data: [], error: null }),
    }) },
  },
  isSupabaseConfigured: true,
}));
const { uploadAlbumPhoto } = await import("./publicTokens.js");

describe("album upload path", () => {
  it("is <event>/<album token>/<file>, and the same path is indexed", async () => {
    const path = await uploadAlbumPhoto("ev-1", "album-tok-1234567", { name: "IMG.JPG" }, "יעל");
    expect(path).toMatch(/^ev-1\/album-tok-1234567\/[^/]+\.jpg$/);
    expect(uploads.at(-1)).toBe(path);
    expect(rpc).toHaveBeenCalledWith("album_add_photo", expect.objectContaining({ path_value: path, token_value: "album-tok-1234567" }));
  });

  it("names the file after the TYPE of the uploaded bytes, not the original name", async () => {
    // A re-encoded iPhone photo: the guest picked IMG_0001.HEIC, the bytes are WebP.
    const blob = Object.assign(new Blob(["w"], { type: "image/webp" }), { name: "IMG_0001.HEIC" });
    const path = await uploadAlbumPhoto("ev-1", "album-tok-1234567", blob, "יעל");
    expect(path).toMatch(/\.webp$/);
    expect(lastOpts.contentType).toBe("image/webp");
  });
});
