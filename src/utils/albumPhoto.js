// ── What goes into the public album — re-encoded, always ─────────────────────
//
// The album bucket is PUBLIC: anyone holding a photo's address can download it,
// and the guest who took it never meets the people who will. A phone photo
// carries EXIF, and EXIF carries the GPS position it was taken at — for a
// henna or a brit at home, that is the family's address.
//
// The old path re-encoded only when the photo had to be SHRUNK. A photo already
// under 1600px, a type it did not recognise, or an HEIC the browser could not
// decode all went up as the original file, metadata and all. Drawing to a
// canvas and encoding again is what strips the metadata, so every photo goes
// through it, whatever its size — and a photo that cannot be decoded is not
// uploaded at all, because the only alternative is uploading it raw.
//
// The stored extension comes from the BYTES that are uploaded, not from the
// name the phone gave the original: "IMG_0001.HEIC" re-encoded is a WebP or a
// JPEG, and a key that lies about its content is served with the wrong type.
// ─────────────────────────────────────────────────────────────────────────────

import { compressImage } from "./imageCompress.js";

/** Longest edge and quality the album has always used. */
export const ALBUM_MAX_EDGE = 1600;
export const ALBUM_QUALITY  = 0.82;

/** Mime type → storage extension, for what the `event-album` bucket accepts
 *  (migration 20260727000001: jpeg, png, webp, heic). */
const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** The extension to store a blob of this type under, or null for a type the
 *  bucket would refuse. */
export function albumExtForType(type) {
  return EXT_BY_TYPE[String(type || "").toLowerCase()] ?? null;
}

/**
 * The picker's `accept`. Not `image/*`: a GIF, a TIFF or a RAW file was
 * offered by the picker and then refused by the bucket. HEIC/HEIF are listed
 * because they are what an iPhone hands over, and Safari decodes them — what is
 * uploaded is the re-encoded copy either way. Extensions are listed too: some
 * desktop browsers report an HEIC file with an EMPTY type.
 */
export const ALBUM_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

const isHeic = (file) =>
  /^image\/hei[cf]$/i.test(file?.type || "") || /\.hei[cf]$/i.test(file?.name || "");

const isAccepted = (file) =>
  /^image\/(jpeg|png|webp)$/i.test(file?.type || "") || isHeic(file);

/** An error whose `albumReason` says why a photo never left the phone. */
function refused(reason) {
  return Object.assign(new Error(`album photo refused: ${reason}`), { albumReason: reason });
}

/** What the guest is told for each `albumReason`. */
export const ALBUM_REFUSAL_TEXT = {
  type:   "אפשר להעלות רק תמונות (JPEG, PNG, WEBP או HEIC).",
  heic:   "הדפדפן הזה לא יודע לפתוח תמונות HEIC של אייפון — העלו אותן מהאייפון עצמו, או שמרו אותן כ-JPEG.",
  decode: "הקובץ לא נפתח כתמונה.",
};

/**
 * Turn the file a guest picked into the blob that is uploaded.
 *
 * Never returns the original file. Throws an error with `albumReason`
 * ("type" | "heic" | "decode") when the photo cannot be re-encoded.
 *
 * @param {File} file
 * @param {{ encode?: typeof compressImage }} [opts] — `encode` is injectable
 *   because jsdom has no canvas; the browser harness runs the real one.
 * @returns {Promise<{ blob: Blob, ext: string }>}
 */
export async function prepareAlbumPhoto(file, { encode = compressImage } = {}) {
  if (!isAccepted(file)) throw refused("type");
  let out;
  try {
    out = await encode(file, ALBUM_MAX_EDGE, ALBUM_QUALITY);
  } catch {
    throw refused(isHeic(file) ? "heic" : "decode");
  }
  const blob = out?.blob;
  // The encoder must have produced NEW bytes of a type the bucket takes. The
  // identity check is belt and braces: an encoder that handed the original
  // back would bring the metadata with it.
  const ext = albumExtForType(blob?.type);
  if (!blob || blob === file || !ext || ext === "heic") throw refused("decode");
  return { blob, ext };
}
