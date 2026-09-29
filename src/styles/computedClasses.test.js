import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TASK_PRIORITIES } from "../data/taskTemplates.js";
import { ANNOUNCEMENT_LAYOUTS } from "../data/announcementTemplates.js";
import { VENDOR_STATUSES, PAYMENT_STATUSES } from "../data/vendorConstants.js";

/* Computed CSS-module lookups — `styles["prio_" + p]` — are the one shape
 * qa/cssmod.mjs cannot check: it sees a prefix, not a class. A value with no
 * matching class renders class="undefined" and the element loses its styling
 * with no error (bug class 9). WORKPLAN 107, 29.9.
 *
 * Each site below names its value set FROM THE SOURCE that produces the
 * values, and every class must exist. The last test fails if a new computed
 * lookup appears that is not listed here. */

const classesIn = (css) => new Set([...readFileSync(css, "utf8").matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1]));
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
    prefix: "sheet_", values: localValues("src/screens/NameTagsScreen.jsx", /\{ key: "([a-z]+)",\s+label:/g).filter(k => k !== "table") },
  { file: "src/screens/TasksScreen.jsx", css: "src/screens/TasksScreen.module.css",
    prefix: "prio_", values: TASK_PRIORITIES.map(p => p.value) },
  { file: "src/screens/VendorsScreen.jsx", css: "src/screens/VendorsScreen.module.css",
    prefix: "tone_", values: [...new Set([...VENDOR_STATUSES, ...PAYMENT_STATUSES].map(s => s.tone))] },
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

  it("every computed lookup in src is listed above", () => {
    const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p, out); else if (/\.jsx$/.test(n) && !/\.test\./.test(n)) out.push(p); } return out; };
    const found = [];
    for (const f of walk("src")) {
      const code = srcText(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const m of code.matchAll(/\b(?:styles|base)\["([A-Za-z_]+)"\s*\+/g)) found.push(`${f}:${m[1]}`);
    }
    const listed = new Set(SITES.map(s => `${s.file}:${s.prefix}`));
    expect(found.filter(k => !listed.has(k))).toEqual([]);
  });
});
