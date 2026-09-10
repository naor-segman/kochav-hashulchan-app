/* Checklist 87 — the shared marketing header, verified in a real browser.
 *
 * The header is the most visible element on the site and this change moved it
 * out of two screens into one component, so the bar is what has to be read back
 * — not the code that renders it.
 *
 * The check that matters most is #4. The pricing page's stylesheet carried a
 * `@media (max-width: 600px)` rule that hid .navLinks and .navLoginBtn next to
 * a hamburger that page never rendered, so on a phone its header was a logo and
 * one button, with NO route to כניסה at all. On the page that asks for money.
 * That is asserted here against the live DOM at 390px, and it fails on the
 * pre-change build.
 *
 * Run: node qa/siteHeader.mjs   (expects `npm run build` to have run)
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

const PORT = 4319;
const BASE = `http://127.0.0.1:${PORT}`;
const DESKTOP = { width: 1280, height: 900 };
const PHONE   = { width: 390,  height: 844 };

const results = [];
const check = (name, pass, detail = "") =>
  results.push({ name, pass: !!pass, detail: String(detail) });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: "/home/user/kochav-hashulchan-app", stdio: "ignore",
});
const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return true; } catch { /* not up */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};

/** Visible = laid out AND not display:none/visibility:hidden, read from the DOM. */
const visibleText = (page, selector) => page.$$eval(selector, els =>
  els.filter(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  }).map(el => el.textContent.trim())
);

try {
  if (!await waitForServer()) throw new Error(`preview server never came up on ${PORT}`);

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server"],   // or localhost is routed through the agent proxy
  });

  for (const [label, viewport] of [["desktop", DESKTOP], ["phone", PHONE]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    /* Requests to hosts OUTSIDE the preview server fail in this container: the
     * agent proxy terminates TLS with a CA this Chromium does not trust, so
     * https://fonts.googleapis.com dies with ERR_CERT_AUTHORITY_INVALID and the
     * page logs a bare "Failed to load resource". That is the environment, not
     * the product — a real visitor loads the font fine — and counting it as a
     * console error made this harness report two failures on a header that was
     * correct. The URL is captured so the exemption stays narrow: anything from
     * 127.0.0.1, and any error that is not a resource load, still counts. */
    const blockedExternally = new Set();
    page.on("requestfailed", r => {
      const u = r.url();
      if (!u.startsWith(BASE) && /ERR_CERT|ERR_PROXY|ERR_TUNNEL|ERR_NAME/.test(r.failure()?.errorText || "")) {
        blockedExternally.add(new URL(u).host);
      }
    });
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      if (blockedExternally.size && /Failed to load resource/.test(m.text())) return;
      errors.push(m.text());
    });
    page.on("pageerror", e => errors.push(String(e)));

    for (const route of ["/home", "/pricing"]) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });

      // 1 — there is exactly ONE header, and it carries the brand.
      const headers = await page.$$("header");
      check(`${label} ${route}: one header`, headers.length === 1, `found ${headers.length}`);
      const brand = await visibleText(page, "header a[href='/']");
      check(`${label} ${route}: brand in the bar`, brand.some(t => t.includes("רוויה")), brand.join("|"));

      if (label === "desktop") {
        // 2 — the three links are there, and the burger is not.
        const links = await visibleText(page, "header a");
        for (const want of ["תכונות", "איך זה עובד", "מחירים", "כניסה", "התחילו חינם"]) {
          check(`${label} ${route}: "${want}"`, links.some(t => t === want), links.join(" · "));
        }
        const burger = await page.$$eval("header button", els =>
          els.filter(el => el.getBoundingClientRect().width > 0).length);
        check(`${label} ${route}: no burger`, burger === 0, `${burger} visible`);
      } else {
        // 3 — on a phone the links are hidden and a burger takes their place.
        const links = await visibleText(page, "header a");
        check(`${label} ${route}: links hidden`, !links.includes("תכונות"), links.join(" · "));

        const burger = await page.$("header button[aria-expanded]");
        check(`${label} ${route}: burger exists`, !!burger);

        /* 4 — THE BUG, asserted OUTSIDE the `if (burger)` below.
         *
         * It was inside it first, and the mutation run showed why that was
         * worthless: with the burger removed — exactly the old pricing page —
         * this check did not fail, it DISAPPEARED. The harness went from 42
         * checks to 37 and still printed a near-clean run. A check that stops
         * existing when the thing it guards breaks is not a check.
         *
         * So: open the menu if there is something to open, then demand a route
         * to /login from the bar no matter how it got there. */
        if (burger) { await burger.click(); await page.waitForTimeout(150); }
        const hrefs = await page.$$eval("header a", els =>
          els.filter(el => el.getBoundingClientRect().width > 0)
             .map(el => el.getAttribute("href")));
        check(`${label} ${route}: כניסה reachable`, hrefs.includes("/login"), hrefs.join(" · "));
        check(`${label} ${route}: מחירים reachable`, hrefs.includes("/pricing"), hrefs.join(" · "));
        check(`${label} ${route}: הרשמה reachable`, hrefs.includes("/signup"), hrefs.join(" · "));
        if (burger) { await burger.click(); await page.waitForTimeout(100); }

        if (burger) {
          // 44px is the coarse-pointer floor everywhere else in this codebase.
          const box = await burger.boundingBox();
          check(`${label} ${route}: burger ≥44×44`,
            box && box.width >= 44 && box.height >= 44,
            box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "no box");
          // ...and it must be ON the screen, not pushed past the edge.
          check(`${label} ${route}: burger on screen`,
            box && box.x >= 0 && box.x + box.width <= PHONE.width,
            box ? `x=${Math.round(box.x)} w=${Math.round(box.width)}` : "no box");

          // The panel actually opens, and closes again.
          await burger.click();
          await page.waitForTimeout(150);
          const opened = await visibleText(page, "header a");
          check(`${label} ${route}: menu opens`, opened.length > 2, opened.join(" · "));
          await burger.click();
          await page.waitForTimeout(100);
          const closed = await visibleText(page, "header a");
          check(`${label} ${route}: menu closes`, closed.length < opened.length, closed.join(" · "));
        }
      }

      // 5 — no horizontal overflow. scrollWidth lies (an internally scrollable
      // child inflates it on every ancestor); scrolling and reading scrollX back
      // is the method that does not.
      const scrolled = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      check(`${label} ${route}: no h-overflow`, scrolled === 0, `scrollX=${scrolled}`);
    }

    // 6 — the section anchors still scroll, which is the one behaviour that
    // depends on the link being an <a href="#…"> rather than a <Link>.
    if (label === "desktop") {
      await page.goto(BASE + "/home", { waitUntil: "networkidle" });
      const before = await page.evaluate(() => window.scrollY);
      await page.click("header a[href='#features']");
      await page.waitForTimeout(1200);
      const after = await page.evaluate(() => window.scrollY);
      check("desktop /home: #features scrolls", after > before + 200, `${before} → ${after}`);

      // ...and from another page it is a navigation that lands scrolled.
      await page.goto(BASE + "/pricing", { waitUntil: "networkidle" });
      await page.click("header a[href='/home#features']");
      await page.waitForTimeout(1600);
      const cross = await page.evaluate(() => ({ y: window.scrollY, p: location.pathname }));
      check("cross-page: /pricing → /home#features",
        cross.p === "/home" && cross.y > 200, JSON.stringify(cross));
    }

    check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
    if (blockedExternally.size) {
      console.log(`   note (${label}): external hosts blocked by the proxy, not counted — ` +
        [...blockedExternally].join(", "));
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
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `   [${r.detail}]` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
