/* Checklist 87 — the two PUBLIC gift screens, for service page 6.
 *
 * ── Why this is a second harness and not two more frames in marketingShots ──
 * marketingShots.mjs seeds localStorage and drives the host app. That works for
 * every screen the HOST opens, and it cannot work for the two screens this page
 * is actually about:
 *
 *   /gift/:token        the guest's blessing-and-amount form
 *   /gift/:token/wall   the blessing wall, projected in the hall
 *
 * Both read their data through Supabase, and there is no .env in this repo, so
 * `isSupabaseConfigured` is FALSE in a normal build — `fetchEventByToken` and
 * `fetchGiftWall` return null/[] without ever making a request. In a production
 * build the gift page then renders "הלינק לא תקין או שפג תוקפו" and the wall
 * renders "ממתין לברכות…". marketingShots' own LOCKED-STATE guard is what
 * stopped share.jpg and rsvps.jpg from shipping in exactly that condition.
 *
 * ── What this file does instead, and why it is a seed and not a fake ────────
 * It builds ONE throwaway bundle with a dummy Supabase URL and key, so
 * `isSupabaseConfigured` is true and the screens genuinely issue their RPC
 * calls; the calls are then fulfilled from the invented seed below. Nothing
 * about the rendering is doctored — the components, the CSS, the date
 * arithmetic in `timeAgo` and the 30-second poll are all the product's own. The
 * only thing supplied is the row data, which is exactly what seeding
 * localStorage supplies for every other frame.
 *
 * The dummy key is the literal string "shots_publishable_key". It is not a
 * credential, it never leaves this container, and the bundle it produces goes
 * to dist-shots/ which is gitignored — a marketing image is not worth a real
 * key in git, and that decision is already recorded in marketingShots.mjs.
 *
 * Run: node qa/marketingShotsGift.mjs   (builds dist-shots itself)
 */
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

import { COMPANY } from "../src/data/company.js";

const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

const ROOT   = "/home/user/kochav-hashulchan-app";
const PORT   = 5189;
const BASE   = `http://127.0.0.1:${PORT}`;
const OUT    = `${ROOT}/public/shots`;
const ORIGIN = COMPANY.site;
const STUB   = "https://shots.invalid";      // must match the build env below
const TOKEN  = "gi1";

/* Two different geometries, deliberately.
 *
 * The wall is a landscape screen in a hall, and 1200×760 matches every other
 * marketing image. The gift FORM is a single narrow column — captured at 1200 it
 * came out as a 400px card floating in 800px of empty ground, with the part that
 * matters most (the "מה קורה עכשיו?" disclosure and the composed
 * "שלחו מתנה ← ₪500" button) below the fold. Measured: the card starts at y=99
 * and the button's bottom edge is at y=982 on a 1200px viewport, y=1043 on a
 * phone. So the form is shot in a narrow viewport, tall enough to hold all of it.
 *
 * Whatever the size, it has to be STABLE, because the page declares it on the
 * <img> and qa/servicePages.mjs fails when the declaration and the file disagree.
 * The JPEG header is read back below for exactly that. */
const WALL = { w: 1200, h: 760 };
const FORM = { w: 640,  h: 1100 };

/** Width/height straight out of a JPEG's SOF marker — no image library. */
function jpegSize(path) {
  const b = readFileSync(path);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { w: 0, h: 0 };
}

/* ── The seed ──────────────────────────────────────────────────────────────
 * The same couple as marketingShots.mjs, so the two sets of images belong to
 * one event rather than to two different weddings. Every name is invented.
 *
 * `amount` is deliberately absent from the wall rows: `gift_wall_by_token`
 * does not select it (20260818000300), and a seed that supplied it would let a
 * future regression put shekel figures on a projector screenshot and still
 * pass. The seed mirrors the RPC's real column list and nothing more. */
const EVENT_ROW = {
  id: "e-shots-1",
  name: "החתונה של דנה ויוסי",
  type: "חתונה",
  date: "2027-06-01",
  venue: "אולמי הגן",
  bride_name: "דנה",
  groom_name: "יוסי",
  celebrant_name: null,
  organization_name: null,
  contact_name: null,
  owner_name: null,
  site: null,
  announcements: null,
  rsvp_token: null,
  gift_token: TOKEN,
  invite_token: null,
};

const MIN = 60 * 1000;
const BLESSINGS = [
  ["משפחת כהן",        "לדנה ויוסי היקרים — שתהיה לכם דרך ארוכה, מצחיקה ומלאה. אוהבים!",            4 * MIN],
  ["צוות המשרד",       "מהחבר'ה מהעבודה: סוף סוף יום שבו יוסי מגיע בזמן. מזל טוב ענק!",             18 * MIN],
  ["סבתא מרים",        "נכדתי היקרה, שתדעו רק אושר ובריאות. אני מחכה לרקוד אתכם.",                  47 * MIN],
  ["רון ואביגיל",      "אמרנו לכם עוד בתחנה המרכזית שזה הולך להיות רציני. מזל טוב!",                 2 * 60 * MIN],
  ["חברות מהתיכון",    "לדנה שלנו — שהחיים יהיו טובים אליך כמו שאת טובה לכולם. מתרגשות!",            3 * 60 * MIN],
  ["דודה עדי ודוד ניר", "מאחלים לכם בית חם, צחוק בבקרים וסבלנות בערבים. באהבה גדולה.",               5 * 60 * MIN],
  ["פלוגה ב׳",         "יוסי, שמרנו לך מקום ליד הבר. מזל טוב אח שלי ❤️",                            9 * 60 * MIN],
  ["השכנים מקומה 3",   "תודה שאתם השכנים הכי טובים שיש. שיהיה במזל טוב ובשעה טובה!",                26 * 60 * MIN],
  ["טל וגלית",         "לזוג המושלם — שתמשיכו לצחוק ככה גם בעוד חמישים שנה.",                       50 * 60 * MIN],
  ["משפחת אזולאי",     "בשעה טובה ומוצלחת! מאחלים לכם אהבה, בריאות והרבה נחת.",                     73 * 60 * MIN],
];

const now = Date.now();
const WALL_ROWS = BLESSINGS.map(([donor, msg, ago], i) => ({
  id: `gw${i + 1}`,
  donor_name: donor,
  message: msg,
  created_at: new Date(now - ago).toISOString(),
}));

/* ── Build a throwaway bundle that believes Supabase is configured ───────── */
console.log("building dist-shots …");
const build = spawnSync("npx", ["vite", "build", "--outDir", "dist-shots"], {
  cwd: ROOT,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: STUB,
    VITE_SUPABASE_ANON_KEY: "shots_publishable_key",
  },
  encoding: "utf8",
});
if (build.status !== 0) {
  console.log(build.stdout, build.stderr);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-shots",
  "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore" });

let served = { event: 0, wall: 0 };

try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-proxy-server"],
  });
  const ctx = await browser.newContext({
    viewport: { width: WALL.w, height: 800 },
    deviceScaleFactor: 2,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",   // every date bug in this repo is invisible at offset zero
  });

  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    // The two RPCs, answered from the seed above.
    if (url.origin === STUB) {
      const name = url.pathname.replace("/rest/v1/rpc/", "");
      if (name === "public_event_by_token") {
        served.event++;
        return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify(EVENT_ROW) });
      }
      if (name === "gift_wall_by_token") {
        served.wall++;
        return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify(WALL_ROWS) });
      }
      // Anything else the client asks the stub for (auth, realtime) gets an
      // empty answer rather than a hang.
      return route.fulfill({ status: 200, contentType: "application/json", body: "null" });
    }

    /* The build, served under the REAL origin — same reason as marketingShots:
       these screens print the company name and link back to "/", and a
       screenshot carrying 127.0.0.1 is a picture of an unfinished product. */
    if (url.origin === ORIGIN) {
      const res = await ctx.request.fetch(BASE + url.pathname + url.search, {
        method: route.request().method(),
        headers: route.request().headers(),
        data: route.request().postDataBuffer() ?? undefined,
      });
      return route.fulfill({ response: res });
    }
    return route.continue();
  });

  const page = await ctx.newPage();
  let failed = false;
  const shoot = async (name, geom, expect) => {
    const body = await page.evaluate(() => document.body.innerText);
    const blocked = ["הלינק לא תקין או שפג תוקפו", "ממתין לברכות…", "טוען...",
      "לא הצלחנו לטעון את קיר הברכות."].find(s => body.includes(s)) || null;
    const missing = expect.filter(t => !body.includes(t));
    const stale = body.includes("כוכב השולחן");

    await page.screenshot({
      path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 86,
      fullPage: true, clip: { x: 0, y: 0, width: geom.w, height: geom.h },
    });
    const size = jpegSize(`${OUT}/${name}.jpg`);
    const want = `${geom.w * 2}x${geom.h * 2}`, got = `${size.w}x${size.h}`;
    const flag = stale ? "STALE-BRAND" : got !== want ? "WRONG-SIZE"
      : blocked ? "LOCKED-STATE" : missing.length ? "EMPTY-FRAME" : "ok";
    console.log(`${flag}  ${name}.jpg  (${got}` +
      `${got !== want ? ` — expected ${want}` : ""}` +
      `${blocked ? ` — "${blocked}"` : ""}` +
      `${missing.length ? ` — missing ${JSON.stringify(missing)}` : ""})`);
    if (flag !== "ok") failed = true;
  };

  /* ── 1. The guest's form ───────────────────────────────────────────────
   * Driven, not captured blank. The amount chip and the blessing are pressed
   * and typed through the real inputs, so the button label in the picture
   * ("שלחו מתנה ← ₪500") is the product's own code composing it — the same
   * rule marketingShots follows by pressing the real auto-assign button. */
  await page.setViewportSize({ width: FORM.w, height: 900 });
  await page.goto(`${ORIGIN}/gift/${TOKEN}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "₪500" }).click();
  await page.fill("#gift-message", "מזל טוב לזוג המקסים! שיהיה לכם בית מלא אהבה, צחוק ובריאות.");
  await page.fill("#gift-name", "משפחת לוי");
  await page.waitForTimeout(400);
  await shoot("gift-form", FORM, ["החתונה של דנה ויוסי", "ברכה ומתנה", "₪1,000",
    "מה קורה עכשיו?", "שלחו מתנה ← ₪500"]);

  /* ── 2. The wall ──────────────────────────────────────────────────────── */
  await page.setViewportSize({ width: WALL.w, height: 800 });
  await page.goto(`${ORIGIN}/gift/${TOKEN}/wall`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  /* The entrance animation is a fade+rise on each card. Captured mid-flight the
     top row is half-transparent, so the animation is finished rather than waited
     out — `prefers-reduced-motion` is the product's own opt-out and this is the
     same state a viewer with it set would see. */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(600);
  /* "דנה ויוסי", not the event name: the wall builds its own heading from
     brideName + groomName and falls back to the name only for a celebrant or an
     organisation (GiftWallScreen.jsx:76-83). The first version of this expect
     asked for "החתונה של דנה ויוסי" and reported EMPTY-FRAME on a frame that was
     correct — the check was wrong, not the screen. */
  await shoot("gift-wall", WALL, ["קיר ברכות", "דנה ויוסי", "סבתא מרים",
    "ברכות התקבלו"]);

  /* The wall must never show a shekel figure. Read the rendered text back and
     say so — this is the single most important property of the screen and the
     one a future change to the RPC could quietly break. */
  const money = await page.evaluate(() => /₪|\d[\d,]*\s*ש["״']ח/.test(document.body.innerText));
  console.log(`${money ? "AMOUNTS-ON-WALL" : "ok"}  wall shows no money`);
  if (money) failed = true;

  console.log(`\nRPCs served: public_event_by_token ×${served.event}, gift_wall_by_token ×${served.wall}`);
  if (!served.event || !served.wall) {
    console.log("  ^ a screen did not call its RPC — the stub build is not in use.");
    failed = true;
  }

  await ctx.close();
  await browser.close();
  if (failed) process.exitCode = 1;
} finally {
  server.kill();
}
