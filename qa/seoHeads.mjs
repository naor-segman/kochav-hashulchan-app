/* Checklist 87 / 52 — the per-route <head>, read back from both halves.
 *
 * The measurement that started this: /home, /pricing and all six /services/*
 * served the SAME <title>, the SAME description and no canonical. That is a
 * defect nothing else in the gate can see — every page rendered perfectly, the
 * tests passed, and to Google it was one page.
 *
 * There are two halves and they fail differently, so both are checked here:
 *
 *   BUILD-TIME  `seoPages()` in vite.config.js writes a real document per route
 *               into dist/. This is what a crawler and a WhatsApp preview read,
 *               because neither runs JavaScript. Checked by opening the FILES.
 *
 *   RUN-TIME    `usePageMeta()` sets the head on client-side navigation. This is
 *               what a visitor's tab shows after they click a header link.
 *               Checked in a browser.
 *
 * A convenient accident makes the second check honest: `vite preview` serves
 * with an SPA fallback, so it hands back the generic index.html for
 * /services/seating and ignores the file on disk. Anything correct in the
 * browser below therefore came from the hook and could not have leaked in from
 * the build. (Netlify does NOT behave that way — netlify.toml has an explicit
 * 200-rewrite per route, pinned by netlify/tests/seoRoutes.test.js.)
 *
 * Run: node qa/seoHeads.mjs   (expects a build)
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { SEO_PAGES, pageTitle, pageCanonical } from "../src/data/seo.js";
import { COMPANY } from "../src/data/company.js";

const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

const ROOT = "/home/user/kochav-hashulchan-app";
const DIST = join(ROOT, "dist");
const PORT = 4342;
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const check = (name, pass, detail = "") =>
  results.push({ name, pass: !!pass, detail: String(detail) });

const pick = (html, re) => (html.match(re) || [])[1] ?? null;
const TITLE = /<title>([\s\S]*?)<\/title>/i;
const DESC  = /<meta name="description" content="([^"]*)"/i;
const CANON = /<link rel="canonical" href="([^"]*)"/i;
const OGURL = /<meta property="og:url" content="([^"]*)"/i;
const OGTIT = /<meta property="og:title" content="([^"]*)"/i;

// ── A. the files on disk ─────────────────────────────────────────────────────
const seenTitles = new Map();
for (const page of SEO_PAGES) {
  const file = page.path === "/" ? join(DIST, "index.html")
                                 : join(DIST, page.path, "index.html");
  if (!existsSync(file)) {
    check(`file ${page.path}`, false, `missing ${file}`);
    continue;
  }
  const html = readFileSync(file, "utf8");
  check(`file ${page.path}: title`, pick(html, TITLE) === pageTitle(page),
    `${pick(html, TITLE)}`);
  check(`file ${page.path}: description`, pick(html, DESC) === page.description,
    `${String(pick(html, DESC)).slice(0, 50)}…`);
  check(`file ${page.path}: canonical`, pick(html, CANON) === pageCanonical(page),
    `${pick(html, CANON)}`);
  check(`file ${page.path}: og:url`, pick(html, OGURL) === pageCanonical(page),
    `${pick(html, OGURL)}`);
  check(`file ${page.path}: og:title follows title`,
    pick(html, OGTIT) === pageTitle(page), `${pick(html, OGTIT)}`);
  // Exactly one of each — a second canonical is as bad as none.
  check(`file ${page.path}: one canonical`,
    (html.match(/rel="canonical"/g) || []).length === 1);

  if (page.sitemap !== false) {
    const t = pageTitle(page);
    check(`file ${page.path}: title is unique`, !seenTitles.has(t),
      seenTitles.get(t) || "");
    seenTitles.set(t, page.path);
  }
}

// ── B. robots + sitemap ──────────────────────────────────────────────────────
const robots = existsSync(join(DIST, "robots.txt"))
  ? readFileSync(join(DIST, "robots.txt"), "utf8") : "";
check("robots.txt exists", robots.length > 0);
check("robots.txt points at the sitemap", /Sitemap:\s*https:\/\/\S+\/sitemap\.xml/.test(robots));
check("robots.txt keeps crawlers out of the app", /Disallow:\s*\/app/.test(robots));
/* The guest links must NOT be disallowed: Facebook's and WhatsApp's preview
   crawlers honour robots.txt, so blocking /invite/ would silently kill the
   per-event preview that invite-og.js exists to produce — a regression that
   would show up as "the previews stopped working" months later. */
check("robots.txt does not block the invite preview", !/Disallow:\s*\/invite/.test(robots));

const sitemap = existsSync(join(DIST, "sitemap.xml"))
  ? readFileSync(join(DIST, "sitemap.xml"), "utf8") : "";
check("sitemap.xml exists", sitemap.length > 0);
for (const page of SEO_PAGES) {
  if (page.sitemap === false) {
    /* Its OWN path must be absent, not its canonical. The first version asked
       whether pageCanonical() was listed and failed on /home — whose canonical
       is deliberately "/" and is therefore in the sitemap as the home page.
       The check was wrong, not the sitemap: what "excluded" means is that
       /home is not offered as a second URL for the same document. */
    check(`sitemap excludes ${page.path}`,
      !sitemap.includes(`<loc>${COMPANY.site}${page.path}</loc>`), page.path);
  } else {
    const want = pageCanonical(page);
    check(`sitemap lists ${page.path}`, sitemap.includes(`<loc>${want}</loc>`), want);
  }
}

// ── C. the browser ───────────────────────────────────────────────────────────
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, stdio: "ignore" });

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 500));
  }

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const head = () => page.evaluate(() => ({
    title: document.title,
    desc: document.head.querySelector('meta[name="description"]')?.content ?? null,
    canon: document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
  }));

  for (const p of SEO_PAGES) {
    await page.goto(BASE + p.path, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const h = await head();
    check(`live ${p.path}: title`, h.title === pageTitle(p), h.title);
    check(`live ${p.path}: description`, h.desc === p.description,
      String(h.desc).slice(0, 50));
    check(`live ${p.path}: canonical`, h.canon === pageCanonical(p), h.canon);
  }

  /* The one thing only the hook can do: a CLIENT-SIDE navigation. No document
     is fetched here, so if the title changes it changed in JavaScript. */
  await page.goto(BASE + "/home", { waitUntil: "networkidle" });
  const before = await head();
  await page.click('header a[href="/services/rsvp"]');
  await page.waitForTimeout(600);
  const after = await head();
  const rsvp = SEO_PAGES.find(p => p.path === "/services/rsvp");
  check("client-side nav: title follows the route",
    after.title === pageTitle(rsvp) && after.title !== before.title,
    `${before.title} → ${after.title}`);
  check("client-side nav: canonical follows the route",
    after.canon === pageCanonical(rsvp), after.canon);

  /* And a route that is NOT indexable falls back instead of keeping the last
     page's head — the first version left it alone, so the tab still read
     "מחירים · רוויה" while the visitor sat on the login screen. */
  await page.goto(BASE + "/pricing", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const off = await head();
  check("non-indexable route: title falls back",
    off.title && !off.title.includes("מחירים"), off.title);
  check("non-indexable route: no canonical", off.canon === null, off.canon);

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
