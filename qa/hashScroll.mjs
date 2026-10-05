/**
 * A link into a section lands on the section (review 5.10). Opened fresh, with
 * the site font loading normally, 1.5s late, and never (the request hangs) —
 * the self-hosted Open Sans swaps in and re-wraps the text above the section,
 * which once left /privacy#device 64px off, and the first fix (wait for the
 * fonts) left the page at the top for as long as a font hung.
 *
 * Run: npm run build && node qa/hashScroll.mjs
 */
import { createRequire } from "node:module";
import { startPreview } from "./lib/preview.mjs";
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const { chromium } = createRequire(ROOT + "/")("playwright");
const { base, stop } = await startPreview(4785);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
const LINKS = [["/privacy", "device"], ["/home", "how"], ["/pricing", "human"], ["/services/seating", "how"]];
let fails = 0;
try {
  for (const mode of ["normal", "late", "hung"]) {
    for (const w of [390, 1280]) {
      for (const [path, id] of LINKS) {
        const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
        const p = await ctx.newPage();
        if (mode !== "normal") {
          await p.route("**/fonts/os-*.woff2", async (route) => {
            if (mode === "hung") return;              // never answered
            await new Promise(r => setTimeout(r, 1500));
            await route.continue();
          });
        }
        await p.goto(`${base}${path}#${id}`, { waitUntil: "domcontentloaded" });
        await p.waitForTimeout(3200);
        const top = await p.evaluate((i) => document.getElementById(i)?.getBoundingClientRect().top ?? null, id);
        const ok = top != null && top > -5 && top < 120;
        if (!ok) fails++;
        console.log(`  ${ok ? "ok  " : "FAIL"} ${mode.padEnd(6)} @${w} ${path}#${id}  top=${top == null ? "missing" : Math.round(top)}`);
        await ctx.close();
      }
    }
  }
} finally { await b.close(); await stop(); }
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
