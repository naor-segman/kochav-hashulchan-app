/* Checklist 87 — the service pages, checked for the things a screenshot cannot
 * show and the other harnesses do not cover.
 *
 * contrastReal / focus / hitAreaFull already walk /services/*, so this does not
 * repeat them. What is left is specific to a marketing page built out of large
 * images and Hebrew sentences full of digits:
 *
 *   1. Every image actually LOADS. A 404 on a landing page is a grey box where
 *      the proof was, and nothing else in the gate opens an <img>.
 *   2. Its declared size matches the file, or the page jumps while it loads.
 *   3. Numbers read in the right order. Bug class 7: in an RTL line whose only
 *      characters between two numbers are neutrals, bidi rule N1 resolves them
 *      RTL and the pair SWAPS — "250 / 300" rendered as "300 / 250" once here.
 *      The DOM is no help; the VISUAL order has to be measured with Range rects.
 *   4. One h1, and headings that do not skip a level.
 *   5. No horizontal scroll at any width a phone actually is.
 *
 * Run: node qa/servicePages.mjs   (expects a build)
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

const PORT = 4341;
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTES = ["/services/seating", "/services/event-site"];
const WIDTHS = [320, 360, 390, 414, 768, 1024, 1280, 1440];

const results = [];
const check = (name, pass, detail = "") =>
  results.push({ name, pass: !!pass, detail: String(detail) });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: "/home/user/kochav-hashulchan-app", stdio: "ignore",
});

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 500));
  }

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server"],
  });

  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE + route, { waitUntil: "networkidle" });

    // Everything is loading="lazy" — walk the page so they all fetch.
    await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);

    // 1 + 2 — images load, and the declared box matches the file.
    const imgs = await page.$$eval("img", els => els.map(el => ({
      src: el.getAttribute("src"),
      alt: el.getAttribute("alt") || "",
      declaredW: Number(el.getAttribute("width")) || 0,
      declaredH: Number(el.getAttribute("height")) || 0,
      naturalW: el.naturalWidth,
      naturalH: el.naturalHeight,
      complete: el.complete,
    })));
    check(`${route}: has images`, imgs.length > 0, `${imgs.length}`);
    for (const im of imgs) {
      check(`${route}: loaded ${im.src}`,
        im.complete && im.naturalW > 0, `natural ${im.naturalW}x${im.naturalH}`);
      check(`${route}: alt on ${im.src}`, im.alt.trim().length > 10, im.alt);
      if (im.declaredW && im.declaredH) {
        check(`${route}: declared size matches ${im.src}`,
          im.declaredW === im.naturalW && im.declaredH === im.naturalH,
          `declared ${im.declaredW}x${im.declaredH}, file ${im.naturalW}x${im.naturalH}`);
      }
    }

    /* 3 — bidi. For every text line that holds two numbers, measure where each
     * one is actually PAINTED and require that the first in the source is the
     * first read in RTL, i.e. further to the RIGHT. Range rects, not the DOM. */
    const bidi = await page.evaluate(() => {
      const out = [];
      /* Per ELEMENT, not per text node.
       *
       * The first version walked text nodes and compared the numbers inside
       * each one — and it passed a deliberate mutation, which is how the hole
       * was found. In JSX `{a} / {b}` is THREE children, so React renders three
       * separate text nodes: "250", " / ", "300". A per-node check never
       * compares them to each other, and that is the EXACT shape that produced
       * the "300 / 250" bug this project already shipped once. The one shape
       * the check most needed to catch was the one it could not see.
       *
       * Collecting every number under one element, in source order, catches
       * both shapes. */
      for (const el of document.querySelectorAll("*")) {
        const kids = [...el.childNodes];
        if (!kids.some(n => n.nodeType === 3)) continue;
        if (getComputedStyle(el).direction !== "rtl") continue;

        const found = [];
        for (const n of kids) {
          if (n.nodeType !== 3 || !n.nodeValue) continue;
          for (const m of n.nodeValue.matchAll(/\d+/g)) {
            const r = document.createRange();
            r.setStart(n, m.index);
            r.setEnd(n, m.index + m[0].length);
            const box = r.getBoundingClientRect();
            if (box.width > 0) found.push({ n: m[0], x: box.x, y: Math.round(box.y) });
          }
        }
        for (let i = 1; i < found.length; i++) {
          // Same visual line only — a wrap legitimately puts the next number
          // further right on the row below.
          if (found[i].y !== found[i - 1].y) continue;
          // RTL: what comes FIRST in the source is painted further RIGHT.
          if (found[i].x > found[i - 1].x) {
            out.push({
              text: el.textContent.trim().slice(0, 80),
              a: found[i - 1].n, b: found[i].n,
            });
          }
        }
      }
      return out;
    });
    check(`${route}: numbers not reversed by bidi`, bidi.length === 0,
      bidi.map(b => `"${b.text}" → ${b.a} before ${b.b}`).join(" | "));

    // 4 — heading structure.
    const heads = await page.$$eval("h1,h2,h3,h4", els =>
      els.map(el => ({ level: Number(el.tagName[1]), text: el.textContent.trim().slice(0, 40) })));
    check(`${route}: exactly one h1`,
      heads.filter(h => h.level === 1).length === 1,
      heads.filter(h => h.level === 1).map(h => h.text).join(" | "));
    let skipped = null;
    for (let i = 1; i < heads.length; i++) {
      if (heads[i].level > heads[i - 1].level + 1) skipped = `${heads[i - 1].level}→${heads[i].level} at "${heads[i].text}"`;
    }
    check(`${route}: no skipped heading level`, !skipped, skipped || "");

    // 5 — horizontal scroll. scrollWidth lies; scroll and read scrollX back.
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(250);
      const x = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const v = window.scrollX;
        window.scrollTo(0, 0);
        return v;
      });
      check(`${route}: no h-scroll @${w}`, x === 0, `scrollX=${x}`);
    }

    await page.close();
  }

  await browser.close();
} catch (e) {
  check("harness ran", false, e.message);
} finally {
  server.kill();
}

const failed = results.filter(r => !r.pass);
for (const r of failed) console.log(`FAIL  ${r.name}   [${r.detail}]`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
