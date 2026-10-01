import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* Security headers on every response (audit 28.9, A2).
 *
 * Nothing in the local gate serves the site through Netlify, so the only thing
 * that can check these is reading netlify.toml. The values are parsed out of
 * the one [[headers]] block rather than grepped anywhere in the file, so a
 * commented-out line does not count. */

const toml = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const code = toml.split("\n").map(l => l.replace(/#.*$/, "")).join("\n");

function headerBlock() {
  const m = code.match(/\[\[headers\]\]\s*for\s*=\s*"\/\*"\s*\[headers\.values\]([\s\S]*?)(?=\n\s*\[|$)/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

describe("netlify.toml: security headers on /*", () => {
  const h = headerBlock();

  it("has a headers block for every path", () => {
    expect(h).not.toBeNull();
  });

  it("refuses framing by other sites", () => {
    expect(h["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(h["Content-Security-Policy"]).toMatch(/frame-ancestors 'self'/);
  });

  it("does not forbid framing entirely — the editors preview in a same-origin iframe", () => {
    // 'none' / DENY would blank both previews. They exist, and they are same-origin:
    for (const f of ["src/screens/EventSiteEditorScreen.jsx", "src/screens/AnnouncementsEditorScreen.jsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/<iframe[\s\S]*?src=\{[`"]\/events\//);
    }
    expect(h["X-Frame-Options"]).not.toBe("DENY");
    expect(h["Content-Security-Policy"]).not.toMatch(/frame-ancestors 'none'/);
  });

  it("stops the full guest URL (token) going out as Referer", () => {
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("disables MIME sniffing", () => {
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("does not block the camera the door screen scans QR codes with", () => {
    expect(h["Permissions-Policy"] ?? "").not.toMatch(/camera=\(\)/);
  });
});
