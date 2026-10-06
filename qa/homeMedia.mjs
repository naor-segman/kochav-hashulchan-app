/**
 * The home page's moving pictures (review 5.10; updated 6.10):
 *   - the "לחיצה אחת" product video is gone — the owner found it unclear
 *     (6.10) and #how is three still steps now, so neither product webm
 *     (~2MB each) may be requested at any width;
 *   - every looping video has a pause control that pauses it (WCAG 2.2.2);
 *   - under prefers-reduced-motion nothing moves — no <video> at all.
 * Run: npm run build && node qa/homeMedia.mjs
 */
import { createRequire } from "node:module";
import { startPreview } from "./lib/preview.mjs";
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const { chromium } = createRequire(ROOT + "/")("playwright");
const { base, stop } = await startPreview(4787);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
let fails = 0;
const ok = (c, what, d = "") => { if (!c) fails++; console.log(`  ${c ? "ok  " : "FAIL"} ${what}${d ? "  — " + d : ""}`); };
try {
  for (const w of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    const requested = [];
    p.on("request", r => { if (/\.webm|\.mp4/.test(r.url())) requested.push(r.url().split("/").pop()); });
    await p.goto(base + "/home", { waitUntil: "networkidle" });
    await p.locator("#how").scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
    ok(await p.locator("#how ol li").count() === 3, `@${w} #how is three steps`);
    ok(await p.locator("#how video").count() === 0, `@${w} no video in #how`);
    ok(!requested.some(f => /^product/.test(f)), `@${w} no product video is requested`, requested.join(", "));
    for (const [label, scope] of [["עצירת סרטון הרקע", "main"]]) {
      const btn = p.locator(`${scope} button[aria-label="${label}"]`).first();
      const has = await btn.count();
      ok(has === 1, `@${w} pause control "${label}"`);
      if (!has) continue;
      await btn.click(); await p.waitForTimeout(150);
      const paused = await p.evaluate((s) => {
        const v = document.querySelector(`${s} section video`);
        return v ? v.paused : null;
      }, scope);
      ok(paused === true, `@${w} "${label}" pauses it`, String(paused));
      ok(await p.locator(`${scope} button[aria-label^="הפעלת"]`).count() >= 1, `@${w} and offers to play it again`);
    }
    await ctx.close();
  }
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.goto(base + "/home", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
  const n = await p.evaluate(() => document.querySelectorAll("video").length);
  ok(n === 0, "reduced motion: no video on the page", String(n));
  await ctx.close();
} finally { await b.close(); await stop(); }
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
