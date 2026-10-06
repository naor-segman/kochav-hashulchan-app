import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/* The focus ring on dark grounds (AX, 1.10).
 *
 * The reset.css floor drew every ring in --accent-text, tuned for white. On the
 * marketing header and footer (#14161A) that is 2.64:1 — under the 3:1 a focus
 * indicator needs — on every link they hold; 121 focusable elements across the
 * public pages measured under 3:1 in Chromium before this change, 3 after (all
 * in LandingScreen, which is not this change's file).
 *
 * This pins the mechanism and recomputes the ratio from the token values, so
 * changing a colour in tokens.css re-checks it. */

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const tokens = read("./tokens.css");
const tokenValue = (name) => {
  const m = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found`);
  const v = m[1].trim();
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref ? tokenValue(ref[1]) : v;
};
const lum = (hex) => {
  // "#fff" → "#ffffff": --on-accent is written short.
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = "#" + [...hex.slice(1)].map(c => c + c).join("");
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** The value a CSS-module rule sets on --focus-ring, resolved to a hex. */
const ringIn = (file, selector) => {
  const css = read(file);
  const block = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  const m = block.match(/--focus-ring:\s*var\(--([\w-]+)\)/);
  return m ? tokenValue(m[1]) : null;
};

describe("focus ring token", () => {
  it("defaults to the light-ground accent and the floor uses it", () => {
    expect(tokenValue("focus-ring")).toBe(tokenValue("accent-text"));
    expect(read("./reset.css")).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--focus-ring\)/);
  });

  it.each([
    ["../components/layout/SiteHeader.module.css", ".nav", "text"],
    ["../components/layout/Shell.module.css", ".topbar", "nav-bg"],
    // The brand band since 136 (6.10) — near-black before.
    ["../screens/services/ServicePage.module.css", ".close", "cta"],
  ])("%s %s re-points it to a colour ≥3:1 on its own ground", (file, selector, groundToken) => {
    const ring = ringIn(file, selector);
    expect(ring, `${selector} sets no --focus-ring`).not.toBeNull();
    expect(ratio(ring, tokenValue(groundToken))).toBeGreaterThanOrEqual(3);
  });

  it("the footer is light since 136 (6.10): no override, and the default ring holds on its ground", () => {
    expect(ringIn("../components/layout/Footer.module.css", ".footer")).toBeNull();
    expect(read("../components/layout/Footer.module.css")).toMatch(/\.footer\s*\{[^}]*background:\s*var\(--bg\)/);
    expect(ratio(tokenValue("accent-text"), tokenValue("bg"))).toBeGreaterThanOrEqual(3);
  });

  it("and the default would NOT have been enough there — the reason this exists", () => {
    expect(ratio(tokenValue("accent-text"), tokenValue("nav-bg"))).toBeLessThan(3);
  });
});
