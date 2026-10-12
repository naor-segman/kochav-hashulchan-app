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
/* FILM=seating — the home page's laptop film (owner, 12.10: "סרטון המחשה…
 * רשימת האורחים, החישוב האוטומטי ואז זה מוצג בשולחנות… הגדלת מסך בחלק
 * מהשוטים… ברמה גבוהה"). Not Playwright's recorder (soft, ~1 Mbps): every frame
 * is a screenshot of the real app at 1200×760, the "camera" (zoom and pan) and
 * the captions are set per frame, so the motion is exact and the picture
 * sharp. The frames are piped as JPEG into Playwright's own ffmpeg (mjpeg in,
 * VP8 out). Output: public/shots/seating-film.webm + seating-film.jpg. */
const FILM = process.env.FILM === "seating";
if (FILM) {
  const { spawn } = await import("node:child_process");
  const FPS = 25, VW = 1200, VH = 760;
  const FF = "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux";
  const SHOTS = `${ROOT}/public/shots`;
  server = await startPreview(PORT, ROOT);
  try {
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
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
    const ff = spawn(FF, ["-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "pipe:0",
      "-c:v", "libvpx", "-b:v", "1800k", "-crf", "8", "-qmin", "2", "-qmax", "30", "-auto-alt-ref", "0", "-an", `${SHOTS}/seating-film.webm`], { stdio: ["pipe", "inherit", "inherit"] });
    let frames = 0;
    const shoot = async () => { const buf = await page.screenshot({ type: "jpeg", quality: 92 }); ff.stdin.write(buf); frames++; return buf; };

    /* The stage: no tour, no support bubble, no cookie sheet, no smooth scroll;
       a caption card and a pointer that live OUTSIDE #root, so the camera
       (a transform on #root) never moves them. */
    const stage = () => page.evaluate(() => {
      const st = document.createElement("style");
      // overflow hidden: a scaled #root widens the page, and an RTL page then
      // scrolls sideways — the first zoom landed on the empty left and pushed
      // the caption off-centre.
      st.textContent = `html,body{overflow:hidden!important} html{scroll-behavior:auto!important} [aria-label*="וואטסאפ"],[data-consent],[class*="tour"],[class*="Tour"]{display:none!important}
        #root{transform-origin:0 0;will-change:transform}
        #film-cap{position:fixed;z-index:2147483646;inset-inline:0;bottom:28px;display:flex;justify-content:center;pointer-events:none;font-family:"Open Sans",sans-serif;direction:rtl}
        #film-cap>div{display:flex;align-items:center;gap:14px;padding:14px 22px;background:#fff;border:1px solid #e6e6e8;box-shadow:0 18px 40px rgba(20,22,26,.18);color:#14161A;font-size:22px;font-weight:800}
        #film-cap b{display:grid;place-items:center;width:34px;height:34px;background:#E8437B;color:#fff;font-size:18px}
        #film-dot{position:fixed;z-index:2147483647;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(232,67,123,.9);box-shadow:0 0 0 6px rgba(232,67,123,.25);pointer-events:none;opacity:0}
        #film-fade{position:fixed;inset:0;z-index:2147483645;background:#fff;pointer-events:none;opacity:0}`;
      document.head.appendChild(st);
      for (const id of ["film-cap", "film-dot", "film-fade"]) if (!document.getElementById(id)) { const d = document.createElement("div"); d.id = id; document.documentElement.appendChild(d); }
    });
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    /* The camera never scrolls: the window stays at the top and #root is
       moved and scaled over the whole page. Scrolling under a transform put
       the sticky bar in the middle of the frame and aimed the zoom at the
       wrong place (the first render). Rects are therefore in page coordinates
       taken at scrollY 0. */
    const rectOf = (loc) => loc.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height }; });
    const docH = () => page.evaluate(() => document.getElementById("root").scrollHeight);
    let DH = VH;
    const cam = (rect, s) => {
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const tx = Math.min(0, Math.max(VW - s * VW, VW / 2 - s * cx));
      const ty = Math.min(0, Math.max(VH - s * DH, VH / 2 - s * cy));
      return { s, tx, ty };
    };
    const set = (c, cap, dot, fade) => page.evaluate(({ c, cap, dot, fade }) => {
      window.scrollTo(0, 0); document.documentElement.scrollLeft = 0; document.body.scrollLeft = 0;
      const r = document.getElementById("root");
      r.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.s})`;
      const k = document.getElementById("film-cap");
      if (cap) { k.innerHTML = `<div><b>${cap.n}</b><span>${cap.t}</span></div>`; k.style.opacity = cap.o; } else k.style.opacity = 0;
      const d = document.getElementById("film-dot");
      if (dot) { d.style.left = dot.x + "px"; d.style.top = dot.y + "px"; d.style.opacity = dot.o; d.style.transform = `scale(${dot.k || 1})`; } else d.style.opacity = 0;
      document.getElementById("film-fade").style.opacity = fade || 0;
    }, { c, cap, dot, fade });
    const lerp = (a, b, t) => ({ s: a.s + (b.s - a.s) * t, tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t });
    const shot = async (sec, a, b, cap, extra = () => ({})) => {
      const n = Math.round(sec * FPS);
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 1;
        const x = extra(t, i, n);
        await set(lerp(a, b, ease(t)), cap && { ...cap, o: x.cap ?? 1 }, x.dot, x.fade);
        await shoot();
      }
    };
    const unroot = () => page.evaluate(() => { document.getElementById("root").style.transform = ""; window.scrollTo(0, 0); });
    const CAP1 = { n: 1, t: "רשימת האורחים — עם צדדים וקבוצות" };
    const CAP2 = { n: 2, t: "לחיצה אחת — והמערכת מחשבת" };
    const CAP3 = { n: 3, t: "כל האורחים בשולחנות — לפי מי שחייב לשבת יחד" };
    const fadeIn = t => Math.min(1, t * 4);

    // 1 · The guest list: the list in view, then closer on the first rows.
    console.log("film: guests");
    await page.goto(ORIGIN + "/events/e1/guests", { waitUntil: "networkidle" });
    await stage(); await unroot(); await page.waitForTimeout(600);
    DH = await docH();
    const anchor = await rectOf(page.getByText("סינון:").first());
    // Closer on the first rows, anchored on the NAMES (the reading end, at
    // the right): the first try centred the row and cut every name in half.
    // The VISIBLE name — getByText().first() matched a hidden copy at x≈0 and
    // aimed the zoom at the empty left of the page.
    const nm = await page.evaluate(name => {
      const hits = [...document.querySelectorAll("main *")].filter(el => el.children.length === 0 && el.textContent.trim() === name)
        .map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      const r = hits.sort((a, b) => a.top - b.top)[0];
      return { x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height };
    }, "ניר ביטון");
    const G0 = cam({ x: 0, y: anchor.y - 30, w: VW, h: VH }, 1);
    const G1 = cam({ x: nm.x + nm.w - 620, y: nm.y - 40, w: 660, h: 330 }, 1.6);
    await shot(1.2, G0, G0, CAP1, t => ({ cap: fadeIn(t) }));
    await shot(2.4, G0, G1, CAP1);
    await shot(1.4, G1, G1, CAP1, t => ({ fade: Math.max(0, (t - .55) / .45) }));

    // 2 · The seating screen: the counters, the button, one click.
    console.log("film: seating", frames);
    await page.goto(ORIGIN + "/events/e1/seating", { waitUntil: "networkidle" });
    await stage(); await unroot(); await page.waitForTimeout(700);
    DH = await docH();
    const S0 = { s: 1, tx: 0, ty: 0 };
    const btn = page.getByRole("button", { name: /להושבה אוטומטית|חשבו מחדש/ }).first();
    const br = await rectOf(btn);
    const S1 = cam({ x: br.x - 300, y: br.y - 150, w: br.w + 600, h: br.h + 300 }, 1.6);
    const at = (c) => ({ x: c.tx + c.s * (br.x + br.w / 2), y: c.ty + c.s * (br.y + br.h / 2) });
    await shot(1.0, S0, S0, CAP2, t => ({ fade: 1 - t, cap: fadeIn(t) }));
    await shot(1.6, S0, S1, CAP2);
    const p2 = at(S1);
    await shot(1.2, S1, S1, CAP2, t => { const k = ease(Math.min(1, t * 1.35)); return { dot: { x: VW * .8 + (p2.x - VW * .8) * k, y: VH * .85 + (p2.y - VH * .85) * k, o: 1, k: t > .85 ? .8 : 1 } }; });
    await btn.evaluate(el => el.click());
    await page.waitForTimeout(200);
    await unroot(); DH = await docH();
    await shot(0.7, S1, S1, CAP2, t => ({ dot: { ...p2, o: 1 - t, k: 1 + t * 1.6 } }));

    // 3 · The result: the counters now read seated, then a table up close.
    console.log("film: result", frames);
    const stats = await rectOf(page.getByText("שובצו").first());
    const R0 = cam({ x: stats.x - 520, y: stats.y - 60, w: 640, h: 170 }, 1.5);
    const card = page.locator('[class*="_tCard_"]').first();
    const cr = await rectOf(card);
    const R1 = cam({ x: 0, y: cr.y - 40, w: VW, h: VH }, 1);
    await shot(1.4, S1, R0, CAP3);
    await shot(1.0, R0, R0, CAP3);
    await shot(1.6, R0, R1, CAP3);
    await shot(0.8, R1, R1, CAP3);
    // Open the tables so the close-up shows people, not only counts.
    const openAll = page.getByRole("button", { name: /פתחו הכל/ }).first();
    if (await openAll.count()) { await openAll.evaluate(el => el.click()); await page.waitForTimeout(400); }
    await unroot(); DH = await docH();
    const cr2 = await rectOf(card);
    const R1b = cam({ x: 0, y: cr2.y - 40, w: VW, h: VH }, 1);
    const sc = Math.min(1.8, (VW * .78) / (cr2.w + 32));
    const R2 = cam({ x: cr2.x - 16, y: cr2.y - 16, w: cr2.w + 32, h: Math.min(cr2.h + 32, VH / sc) }, sc);
    await shot(0.6, R1b, R1b, CAP3);
    await shot(2.0, R1b, R2, CAP3);
    await shot(1.6, R2, R2, CAP3, t => ({ fade: Math.max(0, (t - .55) / .45) }));

    // Poster: the tables, full frame, no caption.
    await set(R1b, null, null, 0);
    await page.screenshot({ path: `${SHOTS}/seating-film.jpg`, type: "jpeg", quality: 88 });
    ff.stdin.end();
    await new Promise((res, rej) => ff.on("close", code => code === 0 ? res() : rej(new Error("ffmpeg exited " + code))));
    console.log(`seating-film.webm — ${frames} frames, ${(frames / FPS).toFixed(1)}s`);
    await browser.close();
  } finally { server.stop(); }
  process.exit(0);
}
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
