import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TASK_PRIORITIES } from "../data/taskTemplates.js";
import { ANNOUNCEMENT_LAYOUTS } from "../data/announcementTemplates.js";
import { VENDOR_STATUSES, PAYMENT_STATUSES } from "../data/vendorConstants.js";
import { NAME_TAG_SIZES } from "../data/nameTagSizes.js";

/* Computed CSS-module lookups — `styles["prio_" + p]` — are the one shape
 * qa/cssmod.mjs cannot check: it sees a prefix, not a class. A value with no
 * matching class renders class="undefined" and the element loses its styling
 * with no error (bug class 9). WORKPLAN 107, 29.9.
 *
 * Each site below names its value set FROM THE SOURCE that produces the
 * values, and every class must exist. The last test fails if a new computed
 * lookup appears that is not listed here. */

// Comments stripped first: a class that survives only inside a comment is
// not a class (29.9 review).
const classesIn = (css) => new Set([...readFileSync(css, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  .matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1]));
const srcText = (f) => readFileSync(f, "utf8");

// Values that live in a component's local constant are read out of that file,
// so a new value added there is checked too.
const localValues = (file, re) => [...srcText(file).matchAll(re)].map(m => m[1]);

const SITES = [
  { file: "src/components/seating/SuggestionsPanel.jsx", css: "src/components/seating/SuggestionsPanel.module.css",
    prefix: "groupHeader_", values: localValues("src/components/seating/SuggestionsPanel.jsx", /style:\s*"([a-z]+)"/g) },
  { file: "src/components/seating/SuggestionsPanel.jsx", css: "src/components/seating/SuggestionsPanel.module.css",
    prefix: "row_", values: [...new Set(localValues("src/logic/seatingAnalysis.js", /severity:\s*"([a-z]+)"/g))] },
  { file: "src/screens/AnnouncementScreen.jsx", css: "src/screens/AnnouncementScreen.module.css",
    prefix: "layout_", values: ANNOUNCEMENT_LAYOUTS.map(l => l.key) },
  { file: "src/screens/NameTagsScreen.jsx", css: "src/screens/NameTagsScreen.module.css",
    // The sizes moved to data/nameTagSizes.js (audit 3.10, C8) so the event-day
    // page can quote them; read from there, still the source that produces them.
    prefix: "sheet_", values: NAME_TAG_SIZES.map(s => s.key).filter(k => k !== "table") },
  { file: "src/screens/TasksScreen.jsx", css: "src/screens/TasksScreen.module.css",
    prefix: "prio_", values: TASK_PRIORITIES.map(p => p.value) },
  { file: "src/screens/VendorsScreen.jsx", css: "src/screens/VendorsScreen.module.css",
    prefix: "tone_", values: [...new Set([...VENDOR_STATUSES, ...PAYMENT_STATUSES].map(s => s.tone))] },
];

// Lookups whose key is an EXPRESSION, not a prefix: each names the object (or
// array) in its own file that holds the class names, and every one must exist.
const objectValues = (file, name) => {
  const m = new RegExp(`const ${name} = ([\\[{][\\s\\S]*?[\\]}]);`).exec(srcText(file));
  return m ? [...m[1].matchAll(/"([A-Za-z_][\w-]*)"/g)].map(x => x[1]) : [];
};
const OPAQUE = [
  { file: "src/admin/screens/AdminSubscriptionsScreen.jsx", css: "src/admin/screens/AdminSubscriptionsScreen.module.css",
    expr: "PLAN_BADGE[plan]", values: objectValues("src/admin/screens/AdminSubscriptionsScreen.jsx", "PLAN_BADGE") },
  { file: "src/admin/screens/AdminSubscriptionsScreen.jsx", css: "src/admin/screens/AdminSubscriptionsScreen.module.css",
    expr: "STATUS_BADGE[status]", values: objectValues("src/admin/screens/AdminSubscriptionsScreen.jsx", "STATUS_BADGE") },
];

describe("computed CSS-module class names all exist", () => {
  for (const site of SITES) {
    it(`${site.file.split("/").pop()}: ${site.prefix}*`, () => {
      expect(site.values.length, "the value set was found").toBeGreaterThan(0);
      const have = classesIn(site.css);
      const missing = site.values.filter(v => !have.has(site.prefix + v)).map(v => site.prefix + v);
      expect(missing).toEqual([]);
    });
  }

  for (const site of OPAQUE) {
    it(`${site.file.split("/").pop()}: styles[${site.expr}]`, () => {
      expect(site.values.length, "the class list was found").toBeGreaterThan(0);
      const have = classesIn(site.css);
      expect(site.values.filter(v => v && !have.has(v))).toEqual([]);
    });
  }

  /* Every `[...]` lookup on ANY CSS-module import, in .js and .jsx. Its first
     version matched only `(styles|base)["x" +`, and a template literal, single
     quotes or a bare expression slipped past — measured in the 29.9 review. */
  it("every computed lookup in src is listed above", () => {
    const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, out); else if (/\.(jsx?|tsx?)$/.test(n) && !/\.test\./.test(n)) out.push(p); } return out; };
    const prefixes = new Set(SITES.map(s => `${s.file}:${s.prefix}`));
    const exprs    = new Set(OPAQUE.map(s => `${s.file}:${s.expr}`));
    const unlisted = [];
    for (const f of walk("src")) {
      const code = srcText(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      const names = [...code.matchAll(/import\s+(\w+)\s+from\s+["'][^"']+\.module\.css["']/g)].map(m => m[1]);
      for (const n of names) {
        for (const m of code.matchAll(new RegExp(`\\b${n}\\[`, "g"))) {
          // Balanced: `styles[PLAN_BADGE[plan]]` holds a bracket of its own.
          let i = m.index + m[0].length, depth = 1;
          while (i < code.length && depth) { if (code[i] === "[") depth++; else if (code[i] === "]") depth--; i++; }
          const inner = code.slice(m.index + m[0].length, i - 1).trim();
          if (/^(["'])[\w-]*\1$/.test(inner)) continue;                 // styles["literal"]: static
          const pre = /^(["'])([\w-]+)\1\s*\+/.exec(inner) || /^`([\w-]+)\$\{/.exec(inner);
          if (pre) { const k = `${f}:${pre[2] ?? pre[1]}`; if (!prefixes.has(k)) unlisted.push(k); continue; }
          if (!exprs.has(`${f}:${inner}`)) unlisted.push(`${f}:[${inner}]`);
        }
      }
    }
    expect(unlisted).toEqual([]);
  });
});
