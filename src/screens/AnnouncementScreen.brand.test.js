import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SITE_THEME_LIST } from "../data/eventSiteTemplates.js";

/* 38d: the invitation footer ("✦ נבנה ב…") is small text in the theme's
 * muted colour on the theme's page ground — and it carried opacity .8 on top,
 * which blends it toward the ground. Computed per theme, not judged by eye,
 * and against the ground the footer actually sits on (.root's --a-bg; the
 * footer is outside the card), not against white (bug class 5). */

const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const blend = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

const css = readFileSync(new URL("./AnnouncementScreen.module.css", import.meta.url), "utf8");
const brand = /^\.brand \{([^}]*)\}/m.exec(css)[1];
const opacity = Number((/opacity:\s*([\d.]+)/.exec(brand) || [, "1"])[1]);
const colorVar = (/color:\s*var\((--a-[a-z-]+)\)/.exec(brand) || [])[1];
const THEME_KEY = { "--a-muted": "muted", "--a-ink": "ink" };

describe("the invitation footer brand line", () => {
  it("is drawn in a theme colour this test knows how to measure", () => {
    expect(THEME_KEY[colorVar], `unexpected .brand colour ${colorVar}`).toBeTruthy();
  });

  for (const t of SITE_THEME_LIST) {
    it(`reaches 4.5:1 on the ${t.key} theme`, () => {
      const ground = rgb(t.bg);
      const fg = blend(rgb(t[THEME_KEY[colorVar]]), ground, opacity);
      expect(ratio(fg, ground)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
