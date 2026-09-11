import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SEO_PAGES, pageTitle, pageCanonical, seoServiceIds } from "../../src/data/seo.js";
import { SERVICES } from "../../src/data/services.js";

/**
 * The two hand-maintained edges of the per-route SEO work (checklist 87 / 52).
 *
 * Both are the same bug class — number 6 in CLAUDE.md, "a duplicate that is
 * maintained by hand will drift". `supabase/setup_full.sql` fell seven
 * migrations behind that way and a fresh project came up with three tables
 * missing. Here the drift would be quieter still: a service added to
 * services.js with no entry in seo.js, or a route with no rule in netlify.toml,
 * produces a page that LOADS PERFECTLY and serves the generic homepage title —
 * which is exactly the bug this work exists to fix, looking like it was never
 * fixed. Nothing else in the gate opens netlify.toml at all.
 */

const toml = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");

describe("seo: every live service has metadata", () => {
  it("services.js and seo.js name the same set", () => {
    const live = SERVICES.filter(s => s.live).map(s => s.id).sort();
    expect(seoServiceIds().sort()).toEqual(live);
  });

  it("every page has a non-empty title and description", () => {
    for (const p of SEO_PAGES) {
      expect(p.title, p.path).toBeTruthy();
      expect(p.description, p.path).toBeTruthy();
    }
  });

  it("no two pages share a title — that IS the bug being fixed", () => {
    // /home is the home page under a second path and shares its title on
    // purpose; its canonical points at "/" and it is out of the sitemap.
    const indexable = SEO_PAGES.filter(p => p.sitemap !== false);
    const titles = indexable.map(pageTitle);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("no two pages share a description", () => {
    const indexable = SEO_PAGES.filter(p => p.sitemap !== false);
    const descs = indexable.map(p => p.description);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it("every canonical is absolute and on the real domain", () => {
    for (const p of SEO_PAGES) {
      expect(pageCanonical(p), p.path).toMatch(/^https:\/\/revaya-events\.co\.il\//);
    }
  });
});

describe("seo: netlify.toml serves the per-route document", () => {
  /** Is `path` covered by an explicit rule or by a splat prefix? */
  const covered = (path) => {
    if (new RegExp(`from\\s*=\\s*"${path}"`).test(toml)) return true;
    for (const m of toml.matchAll(/from\s*=\s*"([^"]+)\/\*"/g)) {
      if (path.startsWith(m[1] + "/")) return true;
    }
    return false;
  };

  it("every indexable route has a rule", () => {
    const missing = SEO_PAGES
      .map(p => p.path)
      .filter(path => path !== "/" && !covered(path));
    expect(missing).toEqual([]);
  });

  it("the SPA fallback is LAST — first match wins", () => {
    const fallback = toml.indexOf('from   = "/*"');
    expect(fallback).toBeGreaterThan(-1);
    // Any other `from =` after the catch-all would never be reached.
    const after = toml.slice(fallback + 1);
    expect(after).not.toMatch(/from\s*=\s*"/);
  });
});
