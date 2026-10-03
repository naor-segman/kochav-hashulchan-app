import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { TOURS } from "./tours.js";
import { AREAS } from "./eventAreas.js";
import { SHARE_GROUPS } from "../components/share/shareLinks.js";

/**
 * The tour skips a step whose part is not on the page — which is right on a
 * first visit to an empty screen, and also exactly how a RENAMED or deleted
 * `data-tour` would hide: the step just stops appearing, nothing errors, and
 * every check that walks the tour still passes. So: every target named here
 * must be written as a literal `data-tour="…"` somewhere in src/.
 */

function sources(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.jsx?$/.test(f) && !/\.test\./.test(f)) out.push(readFileSync(p, "utf8"));
  }
  return out;
}
const SRC = sources("src").join("\n");
const declared = new Set([
  ...[...SRC.matchAll(/data-tour="([^"]+)"/g)].map(m => m[1]),
  // A conditional target — data-tour={cond ? "key" : undefined} — names its
  // key as a string literal inside the expression.
  ...[...SRC.matchAll(/data-tour=\{[^}]*?"([a-z]+\.[A-Za-z]+)"/g)].map(m => m[1]),
]);
// The share screen keys its cards by group: data-tour={"share." + group.id}.
if (SRC.includes('data-tour={"share." + group.id}')) SHARE_GROUPS.forEach(g => declared.add("share." + g.id));

describe("tours — every step points at something that exists", () => {
  for (const [screen, steps] of Object.entries(TOURS)) {
    it(`${screen}: every target is a data-tour in the code`, () => {
      const missing = steps.filter(s => s.target && !declared.has(s.target)).map(s => s.target);
      expect(missing).toEqual([]);
    });
  }
});

describe("tours — the copy", () => {
  for (const [screen, steps] of Object.entries(TOURS)) {
    it(`${screen}: 3–7 steps, each with a title and a text, no "!"`, () => {
      expect(steps.length).toBeGreaterThanOrEqual(3);
      expect(steps.length).toBeLessThanOrEqual(7);
      for (const s of steps) {
        expect(s.title?.trim()).toBeTruthy();
        expect(s.text?.trim()).toBeTruthy();
        expect(s.text).not.toMatch(/!/);
      }
    });
  }
});

describe("tours — coverage", () => {
  it("every screen a host can open from the event's areas has a tour", () => {
    // The owner's spec (2.10 #13): "כל השלבים במשתמש, מההתחלה ועד הסוף".
    const screens = AREAS.flatMap(a => a.items.map(it => it.id));
    expect(screens.filter(id => !TOURS[id])).toEqual([]);
  });
  it("and the event list, the start form and the event's map", () => {
    expect(Object.keys(TOURS)).toEqual(expect.arrayContaining(["start", "dashboard", "hub"]));
  });
});
