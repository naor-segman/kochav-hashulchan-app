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
import { startPreview } from "./lib/preview.mjs";
import { routeGoogleFonts } from "./lib/googleFonts.mjs";

const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

const PORT = 4319;
const BASE = `http://127.0.0.1:${PORT}`;
const DESKTOP = { width: 1280, height: 900 };
const PHONE   = { width: 390,  height: 844 };

const results = [];
const check = (name, pass, detail = "") =>
  results.push({ name, pass: !!pass, detail: String(detail) });

/* startPreview refuses to run when the port already answers — see
   qa/lib/preview.mjs. A stale preview from another checkout on this port would
   otherwise be measured instead of this build, silently. */
let server = { stop: () => {} };

/** Visible = laid out AND not display:none/visibility:hidden, read from the DOM. */
const visibleText = (page, selector) => page.$$eval(selector, els =>
  els.filter(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  }).map(el => el.textContent.trim())
);

try {
  server = await startPreview(PORT);

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server"],   // or localhost is routed through the agent proxy
  });

  /* 0 — every width in between (28.9). This harness measured 390 and 1280
   * only, and between them the bar did not fit: from 601 to ~990px כניסה and
   * התחילו חינם were painted off the left edge on every marketing page,
   * invisible, and /pricing scrolled sideways. So: at each width, every
   * visible header control lies wholly inside the viewport, and the page does
   * not scroll sideways. */
  {
    const page = await browser.newPage({ viewport: DESKTOP });
    for (const w of [601, 700, 768, 834, 900, 1000, 1023, 1024, 1100]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const route of ["/home", "/pricing", "/services/seating", "/services/gifts"]) {
        await page.goto(BASE + route, { waitUntil: "networkidle" });
        const r = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll("header a, header button")) {
            const b = el.getBoundingClientRect();
            if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") continue;
            if (b.left < 0 || b.right > innerWidth) out.push(`"${el.textContent.trim()}" ${Math.round(b.left)}…${Math.round(b.right)}`);
          }
          window.scrollTo({ left: -1e5, behavior: "instant" });
          const sx = window.scrollX;
          window.scrollTo({ left: 0, behavior: "instant" });
          return { out, sx };
        });
        check(`@${w} ${route}: every header control on screen`, r.out.length === 0, r.out.join(" | "));
        check(`@${w} ${route}: no h-overflow`, r.sx === 0, `scrollX=${r.sx}`);
      }
    }
    await page.close();
  }

  /* 0b — every label in the bar on ONE line (audit 3.10, P2-1). With six
   * service links, two section links and מחירים flat in the bar, seven of the
   * labels broke onto two lines at 1024, 1280 and 1440 — "אתר לאירוע / והזמנה"
   * stacked in a 68px bar. Measured with the real Heebo (served through curl,
   * see qa/lib/googleFonts.mjs): on the fallback font the widths are not the
   * ones a visitor sees. Lines are counted from the text's own line boxes. */
  {
    const page = await browser.newPage({ viewport: DESKTOP });
    const fonts = await routeGoogleFonts(page);
    for (const w of [1024, 1100, 1280, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const route of ["/home", "/pricing", "/services/event-site"]) {
        await page.goto(BASE + route, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        const wrapped = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll("header a, header button")) {
            const b = el.getBoundingClientRect();
            if (!b.width || b.bottom < 0 || getComputedStyle(el).visibility === "hidden") continue;
            // Per text node: the logo's mark and name are two flex items whose
            // boxes sit at different heights, and that is not a wrap.
            const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let n; (n = tw.nextNode());) {
              if (!n.nodeValue.trim()) continue;
              const rg = document.createRange(); rg.selectNodeContents(n);
              const tops = new Set([...rg.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top)));
              if (tops.size > 1) out.push(`"${n.nodeValue.trim()}" ${tops.size} lines`);
            }
          }
          return out;
        });
        check(`@${w} ${route}: every header label on one line`, wrapped.length === 0, wrapped.join(" | "));
      }
    }
    const fs = fonts.status();
    check("one-line check measured on the real font", fs.served > 0 && fs.failed === 0, JSON.stringify(fs));
    await page.close();
  }

  /* 0c — the services disclosure (audit 3.10, P2-1). All six service pages
   * must stay reachable from the bar once five of them move behind
   * "השירותים": a button that says whether it is open, opens on a click (a
   * tap — there is no hover on a phone-sized tablet), lists the pages, closes
   * on Escape with focus back on the button, and closes on a click outside. */
  {
    const page = await browser.newPage({ viewport: DESKTOP });
    await page.goto(BASE + "/home", { waitUntil: "networkidle" });
    const btn = page.locator("header button[aria-expanded]", { hasText: "השירותים" });
    check("services: one disclosure button in the bar", (await btn.count()) === 1, `${await btn.count()} found`);
    if (await btn.count() === 1) {
      check("services: closed at rest", (await btn.getAttribute("aria-expanded")) === "false");
      await btn.click();
      check("services: a click opens it", (await btn.getAttribute("aria-expanded")) === "true");
      const ctl = await btn.getAttribute("aria-controls");
      const hrefs = await page.$$eval(`#${ctl} a`, as => as.filter(a => a.getBoundingClientRect().width > 0).map(a => a.getAttribute("href")));
      const barHrefs = await page.$$eval("header a", as => as.filter(a => a.getBoundingClientRect().width > 0).map(a => a.getAttribute("href")));
      for (const s of ["seating", "event-site", "planning", "rsvp", "event-day", "gifts"]) {
        check(`services: /services/${s} reachable from the bar`, barHrefs.includes(`/services/${s}`), hrefs.join(" · "));
      }
      const inView = await page.$$eval(`#${ctl}`, ([m]) => { const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
      check("services: the open panel lies inside the screen", inView);
      await page.keyboard.press("Escape");
      check("services: Escape closes", (await btn.getAttribute("aria-expanded")) === "false");
      check("services: focus returns to the button", await btn.evaluate(b => document.activeElement === b));
      await btn.click();
      await page.mouse.click(640, 600);
      check("services: a click outside closes", (await btn.getAttribute("aria-expanded")) === "false");
      await btn.click();
      await page.click(`#${ctl} a[href='/services/gifts']`);
      await page.waitForTimeout(300);
      check("services: following a link navigates and closes",
        (await page.evaluate(() => location.pathname)) === "/services/gifts" &&
        (await page.locator("header button[aria-expanded]", { hasText: "השירותים" }).getAttribute("aria-expanded")) === "false");
      // Keyboard: Tab from the button walks into the open list, and tabbing
      // past its last link closes it rather than leaving a panel hanging.
      await page.goto(BASE + "/home", { waitUntil: "networkidle" });
      await btn.focus(); await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      check("services: Tab moves into the open list",
        await page.evaluate(id => document.getElementById(id)?.contains(document.activeElement), ctl));
      for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
      check("services: tabbing out of the list closes it", (await btn.getAttribute("aria-expanded")) === "false");
    }
    await page.close();
  }

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

    for (const route of ["/home", "/pricing", "/services/seating", "/services/event-site", "/services/planning", "/services/rsvp", "/services/event-day", "/services/gifts"]) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });

      // 1 — there is exactly ONE header, and it carries the brand.
      const headers = await page.$$("header");
      check(`${label} ${route}: one header`, headers.length === 1, `found ${headers.length}`);
      const brand = await visibleText(page, "header a[href='/']");
      check(`${label} ${route}: brand in the bar`, brand.some(t => t.includes("Unica Plan")), brand.join("|"));

      if (label === "desktop") {
        // 2 — the three links are there, and the burger is not.
        const links = await visibleText(page, "header a");
        for (const want of ["תכונות", "איך זה עובד", "מחירים", "כניסה", "התחילו חינם"]) {
          check(`${label} ${route}: "${want}"`, links.some(t => t === want), links.join(" · "));
        }
        // The burger by its label: "השירותים ▾" is a visible header button on
        // desktop now (P2-1), and "no visible button" would count it.
        const burger = await page.$$eval("header button[aria-label]", els =>
          els.filter(el => el.getBoundingClientRect().width > 0).length);
        check(`${label} ${route}: no burger`, burger === 0, `${burger} visible`);
      } else {
        // 3 — on a phone the links are hidden and a burger takes their place.
        const links = await visibleText(page, "header a");
        check(`${label} ${route}: links hidden`, !links.includes("תכונות"), links.join(" · "));

        // [aria-label]: the services disclosure is also a header button with
        // aria-expanded, first in the DOM, and hidden at this width.
        const burger = await page.$("header button[aria-expanded][aria-label]");
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
        // "התחילו חינם" goes straight into the app since 136 stage C (owner,
        // 5.10) — no signup first. Signup is one tap further, from /login.
        check(`${label} ${route}: התחילו חינם reachable`, hrefs.includes("/app"), hrefs.join(" · "));
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
        window.scrollTo({ left: -1e5, behavior: "instant" });
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
  server.stop();
}

const failed = results.filter(r => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `   [${r.detail}]` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
