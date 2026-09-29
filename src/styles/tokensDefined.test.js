import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/* Every var(--x) a stylesheet reads is defined somewhere (second review 29.9,
 * סב25). `var(--surface2)` was read by the legal pages' identity block and the
 * pricing page's detail band, defined nowhere, and resolved to transparent —
 * no error, no warning, like a renamed CSS-Modules class (bug class 9).
 *
 * "Defined" = declared as `--x:` in ANY stylesheet under src/ (themes set
 * their own --a-* on an element), or set from JS as a style property
 * (`"--a-bg": theme.bg`). A var() with a fallback is still checked: a fallback
 * hides the missing token, it does not make it exist. */
const SRC = join(process.cwd(), "src");
const files = readdirSync(SRC, { recursive: true }).map(String);
const css = files.filter(f => f.endsWith(".css")).map(f => [f, readFileSync(join(SRC, f), "utf8")]);
const js  = files.filter(f => /\.(jsx?|tsx?)$/.test(f) && !/\.test\./.test(f)).map(f => readFileSync(join(SRC, f), "utf8"));

const defined = new Set();
for (const [, t] of css) for (const m of t.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
for (const t of js) for (const m of t.matchAll(/["'](--[\w-]+)["']\s*[:\]]/g)) defined.add(m[1]);
for (const t of js) for (const m of t.matchAll(/setProperty\(\s*["'](--[\w-]+)["']/g)) defined.add(m[1]);

describe("CSS custom properties", () => {
  it("every var(--x) read in a stylesheet is defined somewhere", () => {
    const missing = [];
    for (const [f, t] of css) {
      const noComments = t.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of noComments.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!defined.has(m[1])) missing.push(`${f}: ${m[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });
});
