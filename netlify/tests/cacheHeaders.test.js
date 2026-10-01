import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/* Long-lived caching for the hashed build output (סב58).
 *
 * Same approach as securityHeaders.test.js: nothing in the local gate serves
 * through Netlify, so the rules are read out of netlify.toml itself, with
 * comments stripped so a commented-out line does not count. */

const toml = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
const code = toml.split("\n").map(l => l.replace(/#.*$/, "")).join("\n");

/** { [for]: { header: value } } for every [[headers]] block. */
function headerBlocks() {
  const out = {};
  const re = /\[\[headers\]\]\s*for\s*=\s*"([^"]+)"\s*\[headers\.values\]([\s\S]*?)(?=\n\s*\[|$)/g;
  for (const m of code.matchAll(re)) {
    const vals = {};
    for (const line of m[2].split("\n")) {
      const kv = line.match(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/);
      if (kv) vals[kv[1]] = kv[2];
    }
    out[m[1]] = vals;
  }
  return out;
}

describe("netlify.toml: cache headers", () => {
  const blocks = headerBlocks();

  it("caches /assets/* for a year, immutable", () => {
    const cc = blocks["/assets/*"]?.["Cache-Control"] ?? "";
    expect(cc).toMatch(/\bimmutable\b/);
    expect(cc).toMatch(/max-age=31536000\b/);
  });

  it("gives nothing else an immutable lifetime — public/ files keep their names", () => {
    for (const [path, vals] of Object.entries(blocks)) {
      if (path === "/assets/*") continue;
      expect(vals["Cache-Control"] ?? "", path).not.toMatch(/immutable|max-age=[1-9]/);
    }
  });

  it("/assets/ holds only Vite's hashed output — public/ has no assets/ of its own", () => {
    // A file in public/assets/ would be served at /assets/<same name> on every
    // deploy and be cached for a year under a name whose content can change.
    expect(existsSync(new URL("../../public/assets", import.meta.url))).toBe(false);
    // And Vite still writes there (build.assetsDir not moved somewhere unhashed).
    const vite = readFileSync(new URL("../../vite.config.js", import.meta.url), "utf8");
    expect(vite).not.toMatch(/assetsDir/);
  });
});
