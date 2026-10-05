/* 136 — the product moving, for the home page ("תראו את זה קורה").
 *
 * Records the real app with Playwright's video recorder: the seeded wedding's
 * seating screen, a press of automatic seating, a scroll through the result,
 * then the guest list. Phone (390×844) by default; DESK=1 records the laptop
 * version at 1200×760. Output: public/shots-phone/product(.desk).webm.
 * Trim the first loading frames afterwards with Playwright's own ffmpeg:
 *   /opt/pw-browsers/ffmpeg-<version>/ffmpeg-linux -ss 1.6 -i in.webm -c:v libvpx -b:v 1200k -an out.webm
 *
 * Run: node qa/marketingVideo.mjs  ·  DESK=1 node qa/marketingVideo.mjs
 */
import { createRequire } from "node:module";
import { startPreview } from "./lib/preview.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { staleBrand } from "./lib/staleBrand.mjs";

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

import { COMPANY } from "../src/data/company.js";

const require = createRequire("/home/user/kochav-hashulchan-app/");
const { chromium } = require("playwright");

/* The checkout this file lives in — NOT a hardcoded path to the main repo. Run
   from a worktree, the hardcoded version built nothing of its own, previewed the
   MAIN checkout's dist and wrote the images into the main checkout's public/,
   so the branch that changed the product got none of the new pictures. */
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const PORT = 5197;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT  = `${ROOT}/public/shots-phone`;
import { readdirSync, renameSync } from "node:fs";
/* The origin the screenshots must show — read from company.js, not typed, so it
   follows the domain instead of becoming a second place to update. That is the
   whole point of checklist 15, and a hardcoded origin here would put the old
   domain into every marketing image the day it changes. */
const ORIGIN = COMPANY.site;
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

/* Arrivals, seeded so the entrance frame shows the product MID-EVENT.
 *
 * The first version seeded none, and checkin.jpg came back reading
 * "0 מתוך 96 אורחים" over an empty search box and the "הקלידו שם" empty state —
 * a marketing image of a screen with nothing on it, on the section that is
 * supposed to prove the door works. The EMPTY-FRAME guard did not catch it
 * because that frame declared nothing to expect.
 *
 * `arrivedSeats` is the canonical field and it is PER PERSON, not per row
 * (utils/arrival.js): index i lines up with guestSeatNames(g)[i]. Legacy
 * `arrived` means "someone in this row is here" and six other files still read
 * it, so both are written, exactly as withArrivedSeats() does. Partial rows are
 * deliberate — a couple where one has arrived and one has not is the case the
 * whole per-person model exists for, and it should be visible in the picture. */
for (const g of guests) {
  if (g.rsvp !== "confirmed") continue;
  const roll = rnd();
  if (roll > 0.72) continue;                      // not here yet
  const all = roll < 0.58 || g.count === 1;       // most rows arrive whole
  g.arrivedSeats = all
    ? Array.from({ length: g.count }, (_, i) => i)
    : [0];
  g.arrived = true;
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
  /* Tasks in the real shape — {title, note, due, priority, status, doneAt} — and
     spread across the three columns the board actually has, because a board
     with everything in one column shows nothing about a board. One row is
     deliberately overdue so the "באיחור" pill renders. */
  tasks: [
    { id: "k1", title: "לסגור אולם ותאריך",       note: "חתמנו, מקדמה שולמה", due: "2026-06-10", priority: "high",   status: "done",       doneAt: 1780000000000 },
    { id: "k2", title: "לבחור צלם",               note: "אור נגה — מחכים לחוזה", due: "2026-08-01", priority: "high",  status: "done",       doneAt: 1780500000000 },
    { id: "k3", title: "לסגור תפריט מול הקייטרינג", note: "כולל 4 מנות צמחוניות", due: "2026-09-05", priority: "high",  status: "inprogress", doneAt: null },
    { id: "k4", title: "לשלוח הזמנות",            note: "אחרי שהרשימה תיסגר",  due: "2026-09-01", priority: "normal", status: "inprogress", doneAt: null },
    { id: "k5", title: "לבחור שיר לכניסה לחופה",   note: "",                    due: "2027-04-20", priority: "low",    status: "todo",       doneAt: null },
    { id: "k6", title: "לתדרך את הדיילת",          note: "",                    due: "2027-05-30", priority: "normal", status: "todo",       doneAt: null },
    { id: "k7", title: "להזמין הסעות",             note: "תל אביב + ירושלים",   due: "2027-05-01", priority: "normal", status: "todo",       doneAt: null },
  ],
  /* Vendors: every field the row has, including a `payment` that is chosen by
     hand and is NOT derived from price/paid — which is exactly why the landing
     page does not claim the app reconciles them. */
  vendors: [
    { id: "v1", name: "אולמי הגן",       category: "venue",        status: "booked",   contact: "מירי",  phone: "050-1234567", price: "45000", paid: "15000", payment: "advance", note: "מקדמה שולמה, יתרה שבוע לפני" },
    { id: "v2", name: "להקת הכוכבים",     category: "music",        status: "booked",   contact: "איתי",  phone: "052-2345678", price: "12000", paid: "12000", payment: "paid",    note: "כולל הגברה" },
    { id: "v3", name: "אור נגה — צילום",  category: "photographer", status: "quoted",   contact: "אור",   phone: "053-3456789", price: "9500",  paid: "",      payment: "unpaid",  note: "מחכים לחוזה" },
    { id: "v4", name: "פרחי השדה",        category: "flowers",      status: "inquiry",  contact: "",     phone: "054-4567890", price: "",      paid: "",      payment: "unpaid",  note: "לבקש הצעה" },
    { id: "v5", name: "הסעות דרום",       category: "transport",    status: "declined", contact: "",     phone: "",            price: "8000",  paid: "",      payment: "unpaid",  note: "יקר מדי" },
  ],
  /* A budget with real figures. Ids and names match DEFAULT_CATEGORIES so the
     rows render as the product's own categories rather than as custom ones. */
  costs: {
    categories: [
      { id: "venue",        name: "אולם",         budget: "45000", actual: "45000" },
      { id: "catering",     name: "קייטרינג",      budget: "38000", actual: "41200" },
      { id: "music",        name: "מוזיקה",        budget: "12000", actual: "12000" },
      { id: "photographer", name: "צלם וצלמת",     budget: "10000", actual: "9500"  },
      { id: "flowers",      name: "פרחים ועיצוב",  budget: "8000",  actual: "6400"  },
      { id: "invitations",  name: "הזמנות",        budget: "2500",  actual: "1800"  },
      { id: "other",        name: "אחר",           budget: "4000",  actual: "2900"  },
    ],
  },
  /* The event site, filled in rather than left to defaults. `normalizeEventSite`
     would produce a valid but EMPTY site — no address, no shuttles, no story —
     and a screenshot of the editor with every field blank says nothing about
     the product. Every value here is invented; the Waze URL is left empty on
     purpose so the shot shows the fallback the code builds from the address. */
  site: {
    theme: "sand",
    font: "serif",
    hero: "דנה ויוסי",
    heroEn: "Dana & Yossi",
    story: "נפגשנו בתור לקפה בתחנה המרכזית, ומאז אנחנו לא מפסיקים לדבר. נשמח שתהיו איתנו בערב הזה.",
    countdown: true,
    dressCode: "לבוש ערב. הנעליים — תחשבו על דשא.",
    address: "אולמי הגן, רחוב הזית 12, ראשון לציון",
    wazeUrl: "",
    parkingNote: "חניון חינם בצמוד לאולם, הכניסה מרחוב האלון.",
    shuttles: [
      { id: "s1", time: "18:15", place: "תל אביב — רכבת סבידור מרכז" },
      { id: "s2", time: "18:30", place: "ירושלים — בנייני האומה" },
      { id: "s3", time: "23:45", place: "הסעה חזרה — מהאולם" },
    ],
    schedule: [
      { id: "sc1", time: "19:00", title: "קבלת פנים", icon: "🥂" },
      { id: "sc2", time: "20:15", title: "חופה",      icon: "💍" },
      { id: "sc3", time: "21:00", title: "ארוחת ערב", icon: "🍽️" },
      { id: "sc4", time: "22:00", title: "ריקודים",   icon: "💃" },
    ],
    faq: [
      { id: "f1", q: "מתי צריך להגיע?", a: "קבלת הפנים מתחילה ב-19:00, החופה ב-20:15. שווה להגיע מוקדם." },
      { id: "f2", q: "אפשר להביא ילדים?", a: "בשמחה. יש פינת ילדים עם השגחה לאורך כל הערב." },
      { id: "f3", q: "יש חניה?", a: "כן, חניון חינם בצמוד לאולם." },
    ],
    contactPhone: "050-1234567",
    rsvpMessage: "תודה שאישרתם! מחכים לראות אתכם.",
    sections: { countdown: true, gallery: false, schedule: true, location: true, shuttles: true, dressCode: true, gift: true, blessings: true, faq: true },
    gallery: [],
    coverPhoto: null,
    photosKeepUntil: null,
    photosPurgedAt: null,
  },
  tokens: { rsvp: "r1", album: "al1", invite: "i1", gift: "gi1", hostess: "h1", collab: "c1" },
  cloudId: null, createdAt: 1700000000000, updatedAt: 1700000000000,
};

/* ── The frames the landing pages need ─────────────────────────────────────
 * `clip` keeps the shot to the part of the screen that carries the message —
 * a full-page capture of a 14-table list is a tall grey strip on a landing
 * page. Height is in CSS pixels at deviceScaleFactor 2. */
/* `scroll` is not a detail. Several of these screens OPEN with their add-form —
 * "הוספת אורח", "הוספת שולחן" — so a capture at y=0 is a picture of an empty
 * form, and the first version of this file shipped exactly that: a step captioned
 * "מכניסים את האורחים" illustrated by a blank text field instead of the list of
 * 58 people. The offsets put each frame on the part of the screen the caption is
 * actually talking about.
 *
 * Every frame is the same height on purpose. The page declares one intrinsic
 * size on every <img>, and a declared aspect ratio that does not match the file
 * is a layout shift while it loads. */
const H = 844;
const FRAMES = [
  { name: "seating", path: "/events/e1/seating", expect: ["סידור הושבה"] },
  { name: "guests",  path: "/events/e1/guests", anchor: "סינון:" },
  { name: "checkin", path: "/events/e1/checkin", typeGuest: true, noBrandBar: true },
];

/* startPreview, not `spawn("npx", ["vite", "preview", …])` + a poll. That shape
   leaked a server on every run — SIGTERM reached npx and orphaned the vite it
   started — and the next run, with --strictPort, measured the PREVIOUS run's
   build. For a harness that produces the screenshots on the marketing site, that
   means shipping images of old code. Checklist 93; see qa/lib/preview.mjs. */
let server = { stop: () => {} };


const DESK = process.env.DESK === "1";
try {
  server = await startPreview(PORT, ROOT);
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
  const ctx = await browser.newContext({
    ...(DESK ? { viewport: { width: 1200, height: 760 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT + "/_vid", size: DESK ? { width: 1200, height: 760 } : { width: 390, height: 844 } },
  });
  await ctx.addInitScript(e => { try { if (!localStorage.getItem("kochav_hashulchan_v1")) localStorage.setItem("kochav_hashulchan_v1", JSON.stringify({ events: [e], activeEventId: "e1" })); } catch {} }, EVENT);
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN) {
      const res = await ctx.request.fetch(BASE + url.pathname + url.search, { method: route.request().method(), headers: route.request().headers(), data: route.request().postDataBuffer() ?? undefined });
      return route.fulfill({ response: res });
    }
    return route.fallback();
  });
  const page = await ctx.newPage();
  const hide = () => page.addStyleTag({ content: '[aria-label*="וואטסאפ"]{display:none!important} html{scroll-behavior:smooth}' });
  const glide = async (dy, ms) => { const n = Math.round(ms / 40); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await page.waitForTimeout(40); } };

  await page.goto(ORIGIN + "/events/e1/seating", { waitUntil: "networkidle" }); await hide();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: /להושבה אוטומטית|חשבו מחדש/ }).first().click();
  await page.waitForTimeout(2600);
  await glide(900, 2600);
  await page.waitForTimeout(1200);
  await page.goto(ORIGIN + "/events/e1/guests", { waitUntil: "networkidle" }); await hide();
  await page.waitForTimeout(1200);
  await glide(DESK ? 700 : 1500, 2600);
  await page.waitForTimeout(1500);
  const v = page.video();
  await ctx.close();
  const p = await v.path();
  renameSync(p, OUT + (DESK ? "/product-desk.webm" : "/product.webm"));
  console.log("video ->", OUT + (DESK ? "/product-desk.webm" : "/product.webm"));
  await browser.close();
} finally {
  server.stop();
}
