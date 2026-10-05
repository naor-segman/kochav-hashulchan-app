/**
 * The cookie question on the sign-in forms is a strip, and the page leaves
 * room for it (WORKPLAN 136 stage C, owner 5.10 — "באנר העוגיות מכסה את
 * הטופס"). At 320/390/1280 on the four auth routes, after scrolling to the
 * bottom: no control of the form still under the strip; the three controls on
 * one row; the two answers exactly the same width; no horizontal scroll. And
 * outside the forms the full sheet is unchanged.
 *
 * The banner only exists when analytics is configured, so — like
 * cookieConsent.mjs — this builds its own copy with a placeholder id into a
 * temp directory. Run: node qa/consentStrip.mjs
 * Observed failing with the page's bottom room removed ("הרשמה חינמית",
 * "כתבו לנו בוואטסאפ" left under the strip).
 */
import { createRequire } from "node:module";
const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");
import { startPreview } from "./lib/preview.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT = mkdtempSync(join(tmpdir(), "consent-strip-"));
execFileSync("node", ["node_modules/vite/bin/vite.js", "build", "--outDir", OUT, "--emptyOutDir", "--logLevel", "error"], {
  cwd: ROOT, stdio: "inherit",
  env: { ...process.env, VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", VITE_GA_ID: "G-TEST12345" },
});
const { base, stop } = await startPreview(5198, ROOT, ["--outDir", OUT]);
// No banner at all means the build has no analytics id — that is a FAIL, not a pass.
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
let fails = 0;
try {
  for (const w of [320, 390, 1280]) for (const r of ["/login", "/signup", "/reset-password", "/auth/callback"]) {
    const p = await b.newPage({ viewport: { width: w, height: w === 1280 ? 800 : 700 }, hasTouch: w < 1000 });
    await p.goto(base + r, { waitUntil: "networkidle" }); await p.waitForTimeout(700);
    // Scroll to the very bottom: every control must then be clear of the strip.
    await p.evaluate(() => window.scrollTo({ top: 1e6, behavior: "instant" }));
    await p.waitForTimeout(200);
    const res = await p.evaluate(() => {
      const banner = document.querySelector("[data-consent-pending]");
      if (!banner) return { banner: false };
      const br = banner.getBoundingClientRect();
      const stillUnder = [...document.querySelectorAll("main input, main button, main a, main label")].filter(el => {
        const r = el.getBoundingClientRect(); return r.width && r.bottom > br.top + 1;
      }).map(el => (el.textContent || el.placeholder || el.id).trim().slice(0, 18));
      const btns = [...banner.querySelectorAll("button")].map(x => { const r = x.getBoundingClientRect(); return [x.textContent, Math.round(r.width), Math.round(r.height), Math.round(r.top)]; });
      window.scrollTo({ left: -1e5, behavior: "instant" });
      return { banner: true, h: Math.round(br.height), stillUnder, btns, sx: window.scrollX };
    });
    const ok = res.banner && res.stillUnder.length === 0 && res.sx === 0 && Math.max(...res.btns.map(b => b[3])) - Math.min(...res.btns.map(b => b[3])) < 10 && res.btns[0][1] === res.btns[1][1];
    if (!ok) fails++;
    console.log(ok ? "ok  " : "FAIL", w, r, JSON.stringify(res));
    await p.close();
  }
  // Outside the sign-in forms: still the sheet.
  const p = await b.newPage({ viewport: { width: 390, height: 700 } });
  await p.goto(base + "/home", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
  const sheetH = await p.evaluate(() => Math.round(document.querySelector("[data-consent-pending]")?.getBoundingClientRect().height ?? 0));
  // Asserted, not printed (review 5.10): outside the forms it is still the full sheet.
  const sheetOk = sheetH > 180;
  if (!sheetOk) fails++;
  console.log(sheetOk ? "ok  " : "FAIL", "/home is still the full sheet", sheetH);
  // And every page leaves room for it now, not only the sign-in forms: after
  // scrolling to the bottom of /home and /terms no footer link is under it.
  for (const r of ["/home", "/terms"]) {
    await p.goto(base + r, { waitUntil: "networkidle" }); await p.waitForTimeout(500);
    await p.evaluate(() => window.scrollTo({ top: 1e6, behavior: "instant" })); await p.waitForTimeout(200);
    const under = await p.evaluate(() => {
      const br = document.querySelector("[data-consent-pending]").getBoundingClientRect();
      return [...document.querySelectorAll("footer a, footer button")].filter(el => {
        const r = el.getBoundingClientRect(); return r.width && r.bottom > br.top + 1;
      }).map(el => el.textContent.trim().slice(0, 18));
    });
    if (under.length) fails++;
    console.log(under.length ? "FAIL" : "ok  ", r, "footer clear of the sheet", JSON.stringify(under));
  }

  // The phone menu: the sheet steps aside while it is open, and comes back.
  await p.goto(base + "/home", { waitUntil: "networkidle" }); await p.waitForTimeout(400);
  await p.getByRole("button", { name: "פתיחת תפריט" }).click(); await p.waitForTimeout(200);
  const hiddenWhileOpen = await p.evaluate(() => getComputedStyle(document.querySelector("[data-consent-pending]")).display === "none");
  await p.getByRole("button", { name: "סגירת תפריט" }).click(); await p.waitForTimeout(200);
  const backAfter = await p.evaluate(() => getComputedStyle(document.querySelector("[data-consent-pending]")).display !== "none");
  if (!(hiddenWhileOpen && backAfter)) fails++;
  console.log(hiddenWhileOpen && backAfter ? "ok  " : "FAIL", "the sheet steps aside for the phone menu", JSON.stringify({ hiddenWhileOpen, backAfter }));

  // Answered by keyboard on a sign-in form: focus goes to the page, not <body>.
  await p.goto(base + "/login", { waitUntil: "networkidle" }); await p.waitForTimeout(400);
  await p.getByRole("button", { name: "סירוב" }).focus();
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const focused = await p.evaluate(() => document.activeElement?.tagName);
  if (focused !== "MAIN") fails++;
  console.log(focused === "MAIN" ? "ok  " : "FAIL", "answered on /login, focus on the page", focused);
} finally { await b.close(); await stop(); }
process.exit(fails ? 1 : 0);
