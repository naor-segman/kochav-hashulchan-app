import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* Token links stay out of search indexes (audit 3.10, S9).
 *
 * Every route in App.jsx that takes a per-event :token must have an
 * `X-Robots-Tag: noindex` headers block in netlify.toml. The list is read from
 * App.jsx, not written out here, so a new token page added there without a
 * block here fails — bug class 6, a duplicate maintained by hand drifts.
 * Comments are stripped first, so a commented-out block does not count. */

const code = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
  .split("\n").map(l => l.replace(/#.*$/, "")).join("\n");
const toml = code("../../netlify.toml");
const app = readFileSync(new URL("../../src/App.jsx", import.meta.url), "utf8");

const tokenSegments = [...new Set([...app.matchAll(/path="\/([a-z-]+)\/:token/g)].map(m => m[1]))].sort();

function headerValues(forPath) {
  const re = new RegExp(`\\[\\[headers\\]\\]\\s*for\\s*=\\s*"${forPath.replace(/[*]/g, "\\*")}"\\s*\\[headers\\.values\\]([\\s\\S]*?)(?=\\n\\s*\\[|$)`);
  const m = toml.match(re);
  if (!m) return null;
  return Object.fromEntries([...m[1].matchAll(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/gm)].map(x => [x[1], x[2]]));
}

describe("netlify.toml: noindex on every token route", () => {
  it("App.jsx has the token routes this expects (the parse found them)", () => {
    for (const s of ["rsvp", "invite", "gift", "hostess", "collab", "entrance"]) expect(tokenSegments).toContain(s);
  });

  for (const seg of tokenSegments) {
    it(`/${seg}/* carries X-Robots-Tag: noindex`, () => {
      expect(headerValues(`/${seg}/*`)?.["X-Robots-Tag"]).toMatch(/\bnoindex\b/);
    });
  }

  it("the app's indexable pages are NOT noindexed", () => {
    expect(headerValues("/*")?.["X-Robots-Tag"]).toBeUndefined();
    for (const p of ["/services/*", "/home", "/pricing", "/help"]) expect(headerValues(p)).toBeNull();
  });
});
