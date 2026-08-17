// ── Downscale + encode an uploaded photo, in WebP when the browser can ───────
//
// WHY THIS EXISTS AS ONE MODULE
//
// Three call sites had their own copy of the same canvas dance — the event-site
// cover, the event-site gallery, and the announcement's invitation photo. They
// had already drifted (one read the file with FileReader, one with
// createObjectURL; one scaled on the longest edge, one on width alone, so a
// tall portrait came out of the invitation path at 1400px HIGH instead of
// 1400px wide). Changing the output format in three places would have been the
// fourth chance to drift.
//
// WHY WEBP
//
// Every photo here is downloaded once per guest, and a 300-guest event is the
// unit of cost. Measured through this exact pipeline on real photographs
// (qa/webpGain.mjs — hero.jpg and hero-portrait.jpg at the gallery's own 1000px
// / q0.70): WebP is 28% smaller. Cover 23%, invitation 19%.
//
// That 28% is deliberately NOT the 35% the first run of that harness printed.
// Three of its five files were UI SCREENSHOTS, where WebP wins 50–64% because
// the format is far better at flat fills and text edges. Guests upload
// photographs. The average of the two populations describes neither.
//
// WHY DETECTION AND NOT A BROWSER TABLE
//
// `canvas.toBlob` does not fail on a mime type it cannot encode — it silently
// produces a PNG. A PNG of a downscaled photograph is several times LARGER than
// the JPEG it replaced, so an unsupported browser would not degrade to the old
// behaviour, it would degrade to something much worse, invisibly. So support is
// established by encoding one pixel and reading the type back off the blob.
//
// TRANSPARENCY, a deliberate behaviour change: a PNG with an alpha channel used
// to come out of the JPEG path with its transparent areas rendered BLACK, since
// nothing fills the canvas first. WebP keeps the alpha. A logo uploaded as a
// cover stops arriving in a black box.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Memoised: one 1×1 encode, once per page, shared by every call site.
 *
 * Held as the PROMISE rather than the resolved value so that ten photos picked
 * in one batch — which all call this in the same tick — wait on a single probe
 * instead of racing ten of them.
 */
let webpProbe = null;

export function canEncodeWebp() {
  if (webpProbe) return webpProbe;
  webpProbe = new Promise((resolve) => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      // The type of the blob is the answer, not the fact that a blob came back:
      // an unsupported mime type still yields a blob, it is just a PNG.
      c.toBlob((b) => resolve(b?.type === "image/webp"), "image/webp", 0.7);
    } catch {
      resolve(false);
    }
  });
  return webpProbe;
}

/** Decode a File into an <img>, via an object URL that is always revoked. */
function decode(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    // Revoked on BOTH paths. The old copies revoked only on success, so every
    // rejected decode — an HEIC the browser cannot read, a corrupt file — leaked
    // the blob for the lifetime of the tab.
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image decode failed")); };
    img.src = url;
  });
}

/**
 * Downscale to `maxPx` on the LONGEST edge and encode.
 *
 * Longest edge, not width: constraining width alone lets a 3000×4000 portrait
 * through at 1400×1867, which is the tallest and heaviest image on the page —
 * the opposite of what the limit is for. The invitation path did exactly that.
 *
 * @returns {Promise<{blob: Blob, ext: string}>} — `ext` is what the storage
 *   object should be named, so the key and the content type never disagree.
 */
export async function compressImage(file, maxPx = 1200, quality = 0.72) {
  const img = await decode(file);

  let { naturalWidth: w, naturalHeight: h } = img;
  // A photo already smaller than the limit is not scaled UP: Math.min(1, …)
  // keeps it at its own size rather than inventing pixels and paying to store
  // them.
  const scale = Math.min(1, maxPx / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  const webp = await canEncodeWebp();
  const mime = webp ? "image/webp" : "image/jpeg";
  const ext  = webp ? "webp" : "jpg";

  // toBlob, not toDataURL: a data URL is base64, a third larger than the bytes
  // it encodes, and it would only be decoded again to upload.
  const blob = await new Promise((resolve, reject) => {
    c.toBlob(
      (b) => b ? resolve(b) : reject(new Error("compression produced nothing")),
      mime,
      quality
    );
  });

  // The probe said this browser encodes WebP; if the real encode came back as
  // something else anyway, the NAME must follow the bytes. A .webp key holding
  // PNG data is served with the wrong content type to every guest.
  const actual = blob.type === "image/webp" ? "webp"
               : blob.type === "image/png"  ? "png"
               : blob.type === "image/jpeg" ? "jpg"
               : ext;
  return { blob, ext: actual };
}

/**
 * The pre-Storage shape, for an event that has no cloud row to upload against.
 *
 * Guest mode and the window before the first sync have nowhere to put bytes —
 * the Storage policy keys on an event id the server can see — so those keep the
 * base64 behaviour rather than losing the photo the host just picked. Both
 * shapes are strings that render in <img src>.
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsDataURL(blob);
  });
}
