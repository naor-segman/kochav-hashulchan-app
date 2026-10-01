import { describe, it, expect, vi } from "vitest";
import { prepareAlbumPhoto, albumExtForType, ALBUM_ACCEPT, ALBUM_MAX_EDGE } from "./albumPhoto.js";

/* Album privacy (W1 item 1 / 36d): the album bucket is public, and a photo
 * that was small enough not to need shrinking — or that the browser could not
 * decode — went up as the ORIGINAL file, with its EXIF GPS position. */

const reencoded = (type = "image/webp") => vi.fn(async () => ({ blob: new Blob(["new bytes"], { type }), ext: "x" }));

describe("prepareAlbumPhoto", () => {
  it("re-encodes a small JPEG too — the size is not what decides", async () => {
    const encode = reencoded();
    const file = new File(["tiny original with exif"], "IMG_1.jpg", { type: "image/jpeg" });
    const out = await prepareAlbumPhoto(file, { encode });
    expect(encode).toHaveBeenCalledWith(file, ALBUM_MAX_EDGE, expect.any(Number));
    expect(out.blob).not.toBe(file);
    expect(out.ext).toBe("webp");
  });

  it("takes the extension from the re-encoded bytes, not the original name", async () => {
    const out = await prepareAlbumPhoto(new File(["h"], "IMG_0001.HEIC", { type: "image/heic" }), { encode: reencoded("image/jpeg") });
    expect(out.ext).toBe("jpg");
  });

  it("refuses an HEIC the browser cannot decode instead of uploading it raw", async () => {
    const encode = vi.fn(async () => { throw new Error("image decode failed"); });
    // Some desktop browsers report HEIC with an empty type.
    for (const file of [new File(["h"], "IMG.heic", { type: "image/heic" }), new File(["h"], "IMG.HEIC", { type: "" })]) {
      await expect(prepareAlbumPhoto(file, { encode })).rejects.toMatchObject({ albumReason: "heic" });
    }
  });

  it("refuses an undecodable JPEG", async () => {
    const encode = vi.fn(async () => { throw new Error("image decode failed"); });
    await expect(prepareAlbumPhoto(new File(["x"], "a.jpg", { type: "image/jpeg" }), { encode }))
      .rejects.toMatchObject({ albumReason: "decode" });
  });

  it("refuses types the bucket would refuse, without trying to encode them", async () => {
    const encode = reencoded();
    for (const file of [new File(["g"], "a.gif", { type: "image/gif" }), new File(["t"], "a.txt", { type: "text/plain" })]) {
      await expect(prepareAlbumPhoto(file, { encode })).rejects.toMatchObject({ albumReason: "type" });
    }
    expect(encode).not.toHaveBeenCalled();
  });

  it("never hands back the original, even from an encoder that returns it", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    await expect(prepareAlbumPhoto(file, { encode: async (f) => ({ blob: f, ext: "png" }) }))
      .rejects.toMatchObject({ albumReason: "decode" });
  });
});

describe("album types", () => {
  it("maps what the bucket allows and nothing else", () => {
    expect(albumExtForType("image/jpeg")).toBe("jpg");
    expect(albumExtForType("image/webp")).toBe("webp");
    expect(albumExtForType("image/png")).toBe("png");
    expect(albumExtForType("image/gif")).toBeNull();
    expect(albumExtForType("")).toBeNull();
  });
  it("the picker no longer offers every image type", () => {
    expect(ALBUM_ACCEPT).not.toMatch(/image\/\*/);
    expect(ALBUM_ACCEPT).toMatch(/image\/heic/);
  });
});
