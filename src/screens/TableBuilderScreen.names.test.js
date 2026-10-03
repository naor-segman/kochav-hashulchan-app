import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* 38c: table names in the table list were cut with an ellipsis — four of six
 * realistic names at 390px, two at 768 — and the `title` holding the rest does
 * not exist on a phone. Measured in Chromium after the change (6 names, 320 →
 * 1280px): none truncated, at most three lines, page scrollX 0. jsdom has no
 * layout; this pins the CSS that produced those numbers. */

const css = readFileSync("src/screens/TableBuilderScreen.module.css", "utf8");
const rule = (sel) => css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

describe("TableBuilder table names (38c)", () => {
  it("wrap instead of truncating", () => {
    const r = rule(".rowNameText");
    expect(r).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(r).not.toMatch(/white-space:\s*nowrap/);
    expect(r).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("and get a column floor where the row scrolls inside its card", () => {
    const mq = css.match(/@media \(max-width: 600px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(mq).toMatch(/\.tRowNamed\s*\{\s*grid-template-columns:\s*minmax\(140px, 1fr\)/);
    const jsx = readFileSync("src/screens/TableBuilderScreen.jsx", "utf8");
    expect(jsx.match(/styles\.tRowNamed/g)).toHaveLength(2); // header row and body rows
  });
});
