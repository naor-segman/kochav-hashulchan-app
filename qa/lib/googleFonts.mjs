/* Serve Google Fonts to a harness's Chromium through curl.
 *
 * Chromium here cannot reach fonts.googleapis.com itself: the agent proxy
 * terminates TLS with a CA this Chromium does not trust. Most harnesses answer
 * the request with an empty stylesheet, which is fine for "is there an h1" and
 * WRONG for anything about width — Heebo and the fallback differ by enough to
 * decide whether a header label fits on one line (audit 3.10, P2-1). curl does
 * go through the proxy, so the real CSS and the real woff2 files are fetched
 * that way and cached outside the repo.
 *
 * If curl fails the request is answered with an empty stylesheet and the
 * returned `status()` says so, so a harness can print that it measured the
 * fallback font instead of passing silently on it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CACHE = join(tmpdir(), "qa-google-fonts");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** Route Google Fonts on a Playwright context (or page) through curl. */
export async function routeGoogleFonts(target) {
  mkdirSync(CACHE, { recursive: true });
  const state = { served: 0, failed: 0 };
  await target.route(/fonts\.(googleapis|gstatic)\.com/, (route) => {
    const url = route.request().url();
    const file = join(CACHE, createHash("sha1").update(url).digest("hex"));
    const css = url.includes("fonts.googleapis.com");
    try {
      if (!existsSync(file)) {
        writeFileSync(file, execFileSync("curl", ["-sS", "--fail", "--max-time", "20", "-A", UA, url], { maxBuffer: 50e6 }));
      }
      state.served++;
      return route.fulfill({
        status: 200, contentType: css ? "text/css" : "font/woff2",
        body: readFileSync(file), headers: { "access-control-allow-origin": "*" },
      });
    } catch {
      state.failed++;
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    }
  });
  return { status: () => ({ ...state }) };
}
