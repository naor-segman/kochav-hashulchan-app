import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

/**
 * The root font-size is the anchor every rem in the app resolves against —
 * including the whole --step-* ladder. Putting a token there is a loop:
 * --step-1 is 1.0625rem, so `html { font-size: var(--step-1) }` computes the
 * root to 17px, and then every other rem re-anchors to 17px and the entire
 * type scale silently inflates by 6.25%.
 *
 * That happened on 29.7. A mechanical px→step pass rewrote this one line, all
 * 878 converted declarations grew, nothing failed — 328 unit tests, 48 routes
 * and 25 flows all stayed green — and the owner caught it by eye, saying the
 * product had gone "coarse". Nothing in the suite was looking at it.
 *
 * Now something is.
 */

const here = dirname(fileURLToPath(import.meta.url));
const reset = readFileSync(join(here, "reset.css"), "utf8");

/** The `html { … }` block, whatever else it grows. */
const htmlBlock = reset.match(/^html\s*\{([\s\S]*?)^\}/m)?.[1] ?? "";

describe("root font-size", () => {
  it("found the html block at all — a regex matching nothing would pass everything", () => {
    expect(htmlBlock).toMatch(/font-size/);
  });

  it("is an absolute px value, never a token", () => {
    const decl = htmlBlock.match(/font-size\s*:\s*([^;]+);/)?.[1].trim();
    expect(decl).toBeDefined();
    expect(decl).not.toMatch(/var\(|rem|em\b|%/);
    expect(decl).toMatch(/^\d+px$/);
  });

  it("is 16px, so the rem ladder lands on the px values its comments promise", () => {
    expect(htmlBlock).toMatch(/font-size\s*:\s*16px\s*;/);
  });
});
