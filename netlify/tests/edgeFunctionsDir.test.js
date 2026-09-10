import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/* The directory Netlify deploys from, guarded.
 *
 * Netlify bundles EVERY top-level file in `netlify/edge-functions/` for Deno.
 * There is no local command that does this — `npm run build` is Vite and never
 * looks at the folder — so a file that Deno cannot bundle is invisible here and
 * fatal there: the deploy dies at "building site" with exit code 2 and no
 * mention of which file, and the site simply stops updating.
 *
 * That already happened. `invite-og.test.js` was written INSIDE the directory;
 * it imports `vitest`, a bare specifier with no Deno resolution, and it took
 * every build of the branch down with it. The PR sat with three red Netlify
 * checks while `npm run build`, the whole vitest suite and eslint were all
 * green, because none of them touch the edge bundler.
 *
 * Two rules, both derived from that failure:
 *   1. Only real edge functions live there — no tests, no fixtures, no helpers.
 *   2. Their imports resolve without a package manager: relative paths, or the
 *      full URL / `npm:` / `jsr:` specifiers Deno understands. A bare
 *      `import x from "some-package"` is the exact shape that broke.
 */

const DIR = new URL("../edge-functions/", import.meta.url).pathname;

const files = readdirSync(DIR, { withFileTypes: true })
  .filter(e => e.isFile())
  .map(e => e.name);

describe("netlify/edge-functions/ carries only deployable edge functions", () => {
  it("holds no test files — Deno cannot resolve `vitest`", () => {
    const tests = files.filter(f => /\.(test|spec)\./.test(f));
    expect(tests, "move it to netlify/tests/ — a test here fails the DEPLOY, not the suite")
      .toEqual([]);
  });

  it("every file default-exports a handler", () => {
    for (const f of files) {
      const src = readFileSync(join(DIR, f), "utf8");
      expect(/export\s+default\b/.test(src), `${f} has no default export`).toBe(true);
    }
  });

  it("imports nothing a package manager would have to install", () => {
    // Relative, absolute, URL, npm: and jsr: specifiers are all fine in Deno.
    const ok = /^(\.{1,2}\/|\/|https?:|npm:|jsr:|node:)/;
    const bare = [];
    for (const f of files) {
      const src = readFileSync(join(DIR, f), "utf8");
      for (const m of src.matchAll(/^\s*import\s[^;]*?from\s*["']([^"']+)["']/gm)) {
        if (!ok.test(m[1])) bare.push(`${f} → ${m[1]}`);
      }
      for (const m of src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
        if (!ok.test(m[1])) bare.push(`${f} → ${m[1]}`);
      }
    }
    expect(bare, "a bare specifier here breaks the Netlify build, not this test run")
      .toEqual([]);
  });

  it("still contains the invitation OG function", () => {
    // So that "the directory is empty" can never be the reason this passes.
    expect(files).toContain("invite-og.js");
  });
});
