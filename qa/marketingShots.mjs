/* Checklist 87 — the product images for the marketing site.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * public/shots/ held three JPEGs and **all of them showed the old brand name**
 * in the top bar: "כוכב השולחן", from before checklist 11. The landing page has
 * been serving them since the rebrand, so the page that introduces רוויה has
 * been illustrated with somebody else's name. They cannot be reused and they
 * cannot be edited — they have to be retaken from the product.
 *
 * qa/appshots.mjs already screenshots every screen, but its seed is five guests
 * and three tables. That is right for a design pass and useless for marketing:
 * a seating screen with three tables does not show an algorithm doing anything.
 * This harness seeds a FULL wedding — 58 rows, 117 seats, 14 tables, real
 * constraints, a realistic RSVP spread — and captures the frames the landing
 * pages actually need.
 *
 * ── About the data ──────────────────────────────────────────────────────────
 * Every name is invented and every phone number is a visibly patterned
 * placeholder (05X-1234567 and up), because these images are PUBLIC. A
 * plausible-looking Israeli mobile number on a marketing page is somebody's
 * real number.
 *
 * Run:  npm run build && npx vite preview --port 5188   (then)  node qa/marketingShots.mjs
 * Or just: node qa/marketingShots.mjs   — it starts its own preview server.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

const PORT = 5188;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT  = "/home/user/kochav-hashulchan-app/public/shots";
mkdirSync(OUT, { recursive: true });

/* ── The seed ──────────────────────────────────────────────────────────────
 * Built rather than typed, so the numbers on screen (117 seats over 14 tables)
 * are arithmetic and not a claim. */

const FIRST_F = ["דנה","מיכל","נועה","שירה","תמר","יעל","הילה","רותם","אביגיל","ליאור","מאיה","שרון","אורית","גלית","עדי","רונית","נטע","אלה"];
const FIRST_M = ["יוסי","רון","דניאל","איתי","עומר","אורי","גיא","אסף","נדב","עידו","ניר","אלון","טל","שי","עמית","יונתן","ארז","בר"];
const LAST    = ["כהן","לוי","מזרחי","פרץ","ביטון","אברהם","פרידמן","שפירא","אזולאי","גבאי","דהן","אשכנזי","הררי","סגל","ברקוביץ","נחמיאס","אוחיון","רוזן"];

const GROUPS = [
  { name: "משפחה קרובה", side: "bride" },
  { name: "משפחה קרובה", side: "groom" },
  { name: "דודים",       side: "bride" },
  { name: "דודים",       side: "groom" },
  { name: "חברים מהצבא", side: "groom" },
  { name: "חברות מהתיכון", side: "bride" },
  { name: "עבודה",       side: "bride" },
  { name: "עבודה",       side: "groom" },
  { name: "שכנים",       side: "bride" },
  { name: "חברי הורים",  side: "groom" },
];

/* A small deterministic PRNG. `Math.random` would make every run a different
   picture, and a screenshot that changes on each build cannot be reviewed. */
let seed = 20260910;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const guests = [];
for (let i = 0; i < 58; i++) {
  const g = GROUPS[i % GROUPS.length];
  const female = rnd() < 0.5;
  const count = rnd() < 0.42 ? 2 : rnd() < 0.72 ? 1 : rnd() < 0.9 ? 3 : 4;
  const r = rnd();
  guests.push({
    id: `g${i + 1}`,
    name: `${pick(female ? FIRST_F : FIRST_M)} ${pick(LAST)}`,
    side: g.side,
    group: g.name,
    count,
    // Patterned on purpose — see the note at the top of this file.
    phone: `05${i % 9}-${String(1234567 + i * 11111).slice(0, 7)}`,
    rsvp: r < 0.62 ? "confirmed" : r < 0.78 ? "pending" : r < 0.88 ? "declined" : "pending",
  });
}

const tables = [];
const SHAPES = [["round", 10], ["round", 10], ["rect", 12], ["round", 8], ["round", 10]];
for (let i = 0; i < 14; i++) {
  const [shape, capacity] = SHAPES[i % SHAPES.length];
  tables.push({
    id: `t${i + 1}`,
    name: i === 0 ? "הורי הכלה" : i === 1 ? "הורי החתן" : `שולחן ${i - 1}`,
    capacity, shape, type: "regular",
  });
}

/* The event is seeded with NO seating on purpose.
 *
 * The first version of this file seated people with a greedy loop that ignored
 * the constraints, and the screenshot came back reading "2 הפרות" — the flagship
 * image for the flagship page, showing the algorithm failing. The fix is not a
 * cleverer loop here: it is to let the PRODUCT do the seating. The harness
 * opens the seating screen and presses the button, so what the marketing page
 * shows is genuinely what the algorithm returns for this input, violations and
 * all if there are any. If that picture is ever bad, the product is bad and the
 * right response is to fix the product. */
const seating = {};

const totalSeats = guests.filter(g => g.rsvp !== "declined").reduce((n, g) => n + g.count, 0);

const EVENT = {
  id: "e1",
  name: "החתונה של דנה ויוסי",
  type: "חתונה",
  date: "2027-06-01",
  brideName: "דנה", groomName: "יוסי",
  venue: "אולמי הגן", startTime: "19:00",
  guests, tables, seating,
  constraints: [
    { id: "c1", type: "apart",    guestA: "g3",  guestB: "g14" },
    { id: "c2", type: "together", guestA: "g1",  guestB: "g11" },
    { id: "c3", type: "together", guestA: "g22", guestB: "g32" },
    { id: "c4", type: "apart",    guestA: "g7",  guestB: "g19" },
    { id: "c5", type: "together", guestA: "g5",  guestB: "g15" },
  ],
  tasks: [
    { id: "k1", title: "לסגור אולם",       done: true },
    { id: "k2", title: "לבחור צלם",         done: true },
    { id: "k3", title: "לשלוח הזמנות",      done: false },
    { id: "k4", title: "לסגור תפריט",       done: false },
  ],
  vendors: [
    { id: "v1", name: "להקת הכוכבים", category: "מוזיקה", phone: "050-1234567", price: 6000, paid: 2000 },
    { id: "v2", name: "צלם — אור נגה", category: "צילום",  phone: "052-2345678", price: 9500, paid: 3000 },
  ],
  tokens: { rsvp: "r1", album: "al1", invite: "i1", gift: "gi1", hostess: "h1", collab: "c1" },
  cloudId: null, createdAt: 1700000000000, updatedAt: 1700000000000,
};

/* ── The frames the landing pages need ─────────────────────────────────────
 * `clip` keeps the shot to the part of the screen that carries the message —
 * a full-page capture of a 14-table list is a tall grey strip on a landing
 * page. Height is in CSS pixels at deviceScaleFactor 2. */
const FRAMES = [
  { name: "seating",     path: "/events/e1/seating",     h: 760 },
  { name: "guests",      path: "/events/e1/guests",      h: 760 },
  { name: "constraints", path: "/events/e1/constraints", h: 700 },
  { name: "tables",      path: "/events/e1/tables",      h: 700 },
  { name: "checkin",     path: "/events/e1/checkin",     h: 760 },
  { name: "rsvps",       path: "/events/e1/rsvps",       h: 760 },
];

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: "/home/user/kochav-hashulchan-app", stdio: "ignore",
});

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
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,          // retina — these are hero images
  });
  const page = await ctx.newPage();

  await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
  await page.evaluate(e => localStorage.setItem("kochav_hashulchan_v1",
    JSON.stringify({ events: [e], activeEventId: "e1" })), EVENT);

  /* Run the real auto-assign once, and read the result back out of the page. */
  await page.goto(BASE + "/events/e1/seating", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  // The label depends on state: "לחצו להושבה אוטומטית" on an empty event,
  // "חשבו מחדש" once anyone is seated. The seed is empty, so it is the first —
  // matching only /חשבו/ timed out on exactly that.
  const run = page.getByRole("button", { name: /להושבה אוטומטית|חשבו מחדש/ }).first();
  await run.click();
  await page.waitForTimeout(1800);
  const outcome = await page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/(\d+)\s*הפרות/);
    const s = t.match(/(\d+\/\d+)\s*מקומות שובצו/);
    return { violations: m ? Number(m[1]) : null, seats: s ? s[1] : null };
  });
  console.log(`auto-assign: ${outcome.seats} seats placed, ${outcome.violations} violations`);
  if (outcome.violations !== 0) {
    console.log("  ^ the marketing image will show this. Fix the product, not the shot.");
    process.exitCode = 1;
  }

  for (const f of FRAMES) {
    await page.goto(BASE + f.path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: `${OUT}/${f.name}.jpg`, type: "jpeg", quality: 86,
      clip: { x: 0, y: 0, width: 1200, height: f.h },
    });
    // Read the brand back OUT OF THE PAGE rather than trusting that the rebrand
    // reached this screen. The whole reason for this harness is a set of images
    // that carried a stale name for eleven days without anyone noticing.
    const stale = await page.evaluate(() => document.body.innerText.includes("כוכב השולחן"));
    console.log(`${stale ? "STALE-BRAND" : "ok"}  ${f.name}.jpg  (${f.h}px)`);
    if (stale) process.exitCode = 1;
  }

  console.log(`\nseeded: ${guests.length} rows · ${totalSeats} seats · ${tables.length} tables · ${EVENT.constraints.length} constraints`);
  await ctx.close();
  await browser.close();
} finally {
  server.kill();
}
