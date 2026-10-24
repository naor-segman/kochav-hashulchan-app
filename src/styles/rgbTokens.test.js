import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* Every --X-rgb is the same colour as --X, written as components for rgba().
 *
 * They are a hand-kept duplicate, and one drifted: --green-rgb stayed at an
 * older green (18,133,92) after --green moved to #0F7350, so every tinted
 * green ground was a slightly different green from the text on it (19.10). */

const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const pairs = [...tokens.matchAll(/--([\w-]+)-rgb:\s*([^;]+);/g)].map(([, name, rgb]) => [name, rgb.trim()]);

describe("rgb component tokens", () => {
  it("there are some to check", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(7);
  });

  it.each(pairs)("--%s-rgb (%s) matches its colour", (name, rgb) => {
    const hex = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`))?.[1];
    expect(hex, `--${name} is not a 6-digit hex`).toBeTruthy();
    const want = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(", ");
    expect(rgb).toBe(want);
  });
});
