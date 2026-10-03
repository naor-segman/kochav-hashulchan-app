import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

/* Checklist 23 (1.10): the owner took the "בטא" label off the product — the
 * header badge, the note on the account screen and "גרסה 0.1 · בטא מוקדמת".
 * The word is matched only standing alone: "בטאב" (in the tab) and "הבטא"
 * inside a code comment about the old note are not the label. Admin is left
 * out — it is the operator's own panel. */
const SRC = fileURLToPath(new URL("..", import.meta.url));
const WORD = /(^|[^א-ת])בטא(?![א-ת])/u;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "admin") walk(p, out); }
    else if (/\.(jsx?|css)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe("no beta label in the customer app (23)", () => {
  it("no source file shows the word בטא", () => {
    const hits = walk(SRC).filter(f => WORD.test(readFileSync(f, "utf8"))).map(f => relative(SRC, f));
    expect(hits).toEqual([]);
  });
  it("the matcher catches the old badge and note, and spares בטאב", () => {
    expect(WORD.test("<span>בטא</span>")).toBe(true);
    expect(WORD.test("אנחנו בשלב בטא — כל")).toBe(true);
    expect(WORD.test("גרסה 0.1 · בטא מוקדמת")).toBe(true);
    expect(WORD.test("בטאב \"שולחנות\"")).toBe(false);
  });
});
