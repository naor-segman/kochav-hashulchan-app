import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fitTentNames, TENT_NAMES_BUDGET } from "./tentNames.js";

// סב35b — a table card's names block clipped itself past ~3 lines: measured
// at A4 in print media, a table of 16 short names, or 10 long ones, lost its
// tail with nothing on the paper saying so.

const names = (n, len = 7) => [...Array(n)].map((_, i) => ("א".repeat(len - 2) + " " + i).slice(0, len + 2));

describe("fitTentNames", () => {
  it("a short list stays at the full size, every name", () => {
    const r = fitTentNames(names(10));
    expect(r).toEqual({ shown: names(10), more: 0, size: "lg" });
  });

  it("a longer list steps down a size before dropping anyone", () => {
    const list = names(18);
    const r = fitTentNames(list);
    expect(r.size).toBe("sm");
    expect(r.more).toBe(0);
    expect(r.shown).toEqual(list);
  });

  it("past the small budget: the names that fit, and the rest counted — never lost silently", () => {
    const list = names(40);
    const r = fitTentNames(list);
    expect(r.size).toBe("sm");
    expect(r.more).toBeGreaterThan(0);
    expect(r.shown.length + r.more).toBe(40);
    expect(r.shown).toEqual(list.slice(0, r.shown.length));
    const printed = [...r.shown, `ועוד ${r.more}`].join(" · ");
    expect([...printed].length).toBeLessThanOrEqual(TENT_NAMES_BUDGET.sm);
  });

  it("long names (companions) step down sooner — the budget is characters, not heads", () => {
    const long = [...Array(10)].map((_, i) => `רונית-שושנה (טל שוורץ ${i})`);
    expect(fitTentNames(long).size).toBe("sm");
  });

  it("empty and junk input", () => {
    expect(fitTentNames([])).toEqual({ shown: [], more: 0, size: "lg" });
    expect(fitTentNames(undefined)).toEqual({ shown: [], more: 0, size: "lg" });
    expect(fitTentNames(["", null, "דנה"]).shown).toEqual(["דנה"]);
  });
});

// סב35c — an unnamed @page in a CSS module is global, and a module stays in
// the document after its screen is left: SeatingScreen's 15/12mm margins
// applied to every later print, and the name tags' two tents per A4 printed
// one per page. Every @page in a module must be named.
describe("no CSS module declares an unnamed @page", () => {
  const files = [];
  const walk = (d) => readdirSync(d).forEach(f => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".module.css")) files.push(p);
  });
  walk(join(process.cwd(), "src"));

  it("found the modules", () => { expect(files.length).toBeGreaterThan(20); });
  it("every @page is named", () => {
    const bad = files.filter(f => /@page\s*\{/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
    expect(bad).toEqual([]);
  });
});
