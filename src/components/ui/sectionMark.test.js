import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * SectionMark fails the same way CSS Modules do: an unknown key renders null,
 * React draws nothing, and there is no error anywhere. A page head silently
 * loses its mark and the only way to find out is to look at every screen.
 *
 * So this walks the source, collects every mark name the app actually asks
 * for, and asserts the registry has it. No DOM needed — the failure mode is a
 * name mismatch, and names are visible in the text.
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "..");
const repoRoot = join(srcRoot, "..");

const markSource = readFileSync(join(here, "SectionMark.jsx"), "utf8");

/** Keys of the MARKS registry — the top-level `name: (s) => (` entries. */
const registry = [...markSource.matchAll(/^ {2}([A-Za-z][A-Za-z0-9]*): \(s\) => \(/gm)]
  .map((m) => m[1]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** Every `mark="…"` / `name="…"` on a SectionMark or PageHeader in the app. */
function usedMarks() {
  const used = [];
  for (const file of walk(srcRoot)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bmark="([A-Za-z0-9]+)"/g)) used.push([file, m[1]]);
    for (const m of text.matchAll(/<SectionMark\b[^>]*\bname="([A-Za-z0-9]+)"/g)) used.push([file, m[1]]);
  }
  return used;
}

describe("SectionMark registry", () => {
  it("has a drawing for every mark the app asks for", () => {
    const missing = usedMarks()
      .filter(([, name]) => !registry.includes(name))
      .map(([file, name]) => `${name} (${file.replace(repoRoot + "/", "")})`);
    expect(missing).toEqual([]);
  });

  it("found the registry at all — a regex that matches nothing would pass everything", () => {
    expect(registry.length).toBeGreaterThan(20);
    expect(registry).toContain("guests");
    expect(registry).toContain("adminSettings");
  });

  it("found real usages — same guard on the other side", () => {
    expect(usedMarks().length).toBeGreaterThan(10);
  });

  it("stays in step with the contact sheet's list", () => {
    const sheet = readFileSync(join(repoRoot, "qa", "sectionMarkNames.js"), "utf8");
    const listed = [...sheet.matchAll(/"([A-Za-z0-9]+)"/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...registry].sort());
  });
});
