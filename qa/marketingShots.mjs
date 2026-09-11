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
import { mkdirSync, readFileSync } from "node:fs";

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

const PORT = 5188;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT  = "/home/user/kochav-hashulchan-app/public/shots";
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
const H = 760;
const FRAMES = [
  { name: "seating",     path: "/events/e1/seating", expect: ["סידור הושבה", "הושבה מלאה וללא הפרות"] },
  // Anchored, not offset. Hand-tuned numbers were wrong twice — 620 was still
  // inside the "הוספת אורח" form, because that form is 1,300px tall before the
  // list begins. `anchor` finds the element by its text and clips from there,
  // so the frame stays correct when the screen above it changes height.
  { name: "guests",      path: "/events/e1/guests",      anchor: "סינון:",            expect: ["58 רשומות"] },
  { name: "constraints", path: "/events/e1/constraints", anchor: "חייבים לשבת יחד" },
  { name: "tables",      path: "/events/e1/tables",      anchor: "השולחנות שלי" },
  /* `type` drives the real search box before the shot, so the frame shows a
     result with a table number instead of the "הקלידו שם" empty state. The name
     is picked from the seed at run time, not typed here, so it cannot drift
     from the data. `expect` now names what has to be ON the screen. */
  { name: "checkin",     path: "/events/e1/checkin",  typeGuest: true,
    expect: ["דנה ויוסי", "מתוך 96 אורחים", "שולחן"] },
  // ── Service page 5: the day ──────────────────────────────────────────────
  { name: "nametags",    path: "/events/e1/nametags", expect: ["כרטיסי שם"] },
  // ── Service page 2: the event site and the invitation ────────────────────
  { name: "site-editor", path: "/events/e1/site" },
  // ── Service page 3: planning ─────────────────────────────────────────────
  // `expect` is what proves the frame is not an empty form — see the guard below.
  { name: "tasks",       path: "/events/e1/tasks",   expect: ["לוח משימות", "לסגור אולם ותאריך", "הושלמו"] },
  { name: "costs",       path: "/events/e1/costs",   expect: ["תכנון תקציב", "45,000", "עלות לאורח"] },
  { name: "vendors",     path: "/events/e1/vendors", expect: ["ספקים", "אולמי הגן", "נותר לשלם"] },
  // ── Service page 4: RSVP ─────────────────────────────────────────────────
  { name: "messages",    path: "/events/e1/messages" },
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

  /* ── Serve the real build under the REAL origin ──────────────────────────
   * Several of these screens print full share URLs into the page — the site
   * editor shows the event-site and album links, and the links screen shows all
   * ten. Shot against the preview server those read
   * "http://127.0.0.1:5188/invite/i1", and that is what went into a public
   * marketing image on the first run: a localhost URL, on the page that is
   * supposed to make the product look finished.
   *
   * The fix is not to edit the picture. Every request is fulfilled from the
   * local build while the page believes it is on COMPANY.site, so
   * `window.location.origin` is genuinely the production origin and the URLs in
   * the screenshot are the URLs a host would actually see. Nothing is doctored;
   * only where the bytes come from changes. */
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN) {
      const res = await ctx.request.fetch(BASE + url.pathname + url.search, {
        method: route.request().method(),
        headers: route.request().headers(),
        data: route.request().postDataBuffer() ?? undefined,
      });
      return route.fulfill({ response: res });
    }
    // Supabase, fonts and anything else external: let it fail as it already
    // does in this container rather than pretending it succeeded.
    return route.continue();
  });

  await page.goto(ORIGIN + "/app", { waitUntil: "domcontentloaded" });

  /* ── Screens gated on an account cannot be shot here, and that is fine ──
   *
   * There is no .env in this repo, so `isSupabaseConfigured` is false in a local
   * build and `supabase` is null: useAuth can never produce a user, whatever is
   * in localStorage. A faked session was tried and could not work for that
   * reason — worth writing down, because the symptom (a screenshot of the share
   * screen saying "הקישור נפתח אחרי פתיחת חשבון") looks like a product bug and
   * is not one. Every account holder sees those links.
   *
   * The links screen is therefore NOT in FRAMES. Supplying the Supabase URL and
   * the publishable key to a local build would fix it, but they do not belong in
   * the repo, and a marketing image is not worth a credential in git. The
   * LOCKED-STATE guard below is what keeps this decision from quietly reverting:
   * any frame that renders a gated or unpublished state fails the run. */

  await page.evaluate(e => localStorage.setItem("kochav_hashulchan_v1",
    JSON.stringify({ events: [e], activeEventId: "e1" })), EVENT);

  /* Run the real auto-assign once, and read the result back out of the page. */
  await page.goto(ORIGIN + "/events/e1/seating", { waitUntil: "domcontentloaded" });
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
    await page.goto(ORIGIN + f.path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);

    /* Type into the REAL search box rather than seeding a query string — the
       screen owns the matching, and a frame that shows a hand-placed result is
       a picture of a mock. The guest is one that has NOT arrived, so the shot
       shows the action still available rather than a row already ticked. */
    if (f.typeGuest) {
      const waiting = guests.find(g => g.rsvp === "confirmed" && !g.arrivedSeats);
      const box = page.getByPlaceholder(/שם האורח/).first();
      await box.click();
      await box.fill(waiting.name.split(" ")[0]);
      await page.waitForTimeout(700);
    }
    /* Where the frame starts. An anchor is resolved against the document; a
     * screen with no anchor starts at the top. The result is clamped so a clip
     * can never run past the end of a short page — that produced a 1160px-tall
     * image on the RSVP screen. */
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    let y = 0;
    if (f.anchor) {
      y = await page.evaluate((text) => {
        /* Not `children.length === 0` — that was the first version, and it could
           not find "חייבים לשבת יחד" because the label wraps an <Icon/> beside
           its text, so the element holding the words is not a leaf. Match on
           text and then take the DEEPEST hit, which is the tightest element
           that still contains the whole string. */
        const hits = [...document.querySelectorAll("*")]
          .filter(n => n.textContent.trim().startsWith(text));
        if (!hits.length) return -1;
        const depth = n => { let d = 0; while ((n = n.parentElement)) d++; return d; };
        const el = hits.reduce((a, b) => (depth(b) > depth(a) ? b : a));
        return Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY) - 24);
      }, f.anchor);
      if (y < 0) {
        console.log(`ANCHOR-MISSING  ${f.name}: "${f.anchor}"`);
        process.exitCode = 1;
        y = 0;
      }
    }
    y = Math.max(0, Math.min(y, docH - H));

    /* fullPage, and only then clip.
     *
     * Without it `clip` is bounded by the viewport, so asking for y=620..1380
     * of an 800-tall window produced a 2400x360 sliver — a strip of two filter
     * dropdowns, saved under the name of the screenshot that is supposed to
     * show 58 guests. It looked like a cropping choice rather than a bug, which
     * is exactly why it is worth a comment: with fullPage the coordinates are
     * document-relative and the requested box is what comes out. */
    await page.screenshot({
      path: `${OUT}/${f.name}.jpg`, type: "jpeg", quality: 86,
      fullPage: true,
      clip: { x: 0, y, width: 1200, height: H },
    });
    // Read the brand back OUT OF THE PAGE rather than trusting that the rebrand
    // reached this screen. The whole reason for this harness is a set of images
    // that carried a stale name for eleven days without anyone noticing.
    const bodyText = await page.evaluate(() => document.body.innerText);
    const stale = bodyText.includes("כוכב השולחן");

    /* Any frame that still shows a locked or empty state is a marketing image of
     * the product refusing to work. Both of these have already been shipped
     * once by this file. */
    const blocked = (() => {
      for (const s of ["הקישור נפתח אחרי פתיחת חשבון", "הקישורים ממתינים לחשבון",
                       "האתר בהכנה", "הדף עדיין לא פורסם", "הקישור אינו תקין",
                       // Added after rsvps.jpg was saved showing nothing but this
                       // banner. Any screen whose content comes from Supabase
                       // degrades to it in a build with no .env, and the result
                       // is a marketing image of an empty page.
                       "סנכרון ענן אינו מוגדר", "האירוע עדיין לא סונכרן"]) {
        if (bodyText.includes(s)) return s;
      }
      return null;
    })();

    /* An EMPTY frame is as useless as a locked one and the guard above did not
     * catch it: the budget screen shot came back with every figure a dash and
     * every category row a zero, because the seed had no costs in it. A
     * marketing image of an empty form says the product does nothing. Each
     * frame that has something specific to prove names it here, and the run
     * fails if the rendered page does not contain it. */
    const missing = (f.expect || []).filter(t => !bodyText.includes(t));

    /* Two separate ways this file has already produced a wrong image, both of
     * which look like a deliberate crop rather than a bug:
     *   - clip bounded by the viewport → a 2400x360 sliver;
     *   - a scroll offset past the end of a short screen → a 2400x1160 one.
     * The page declares ONE intrinsic size for every screenshot, so anything
     * off-size is also a layout shift. Read the JPEG's own header back. */
    const size = jpegSize(`${OUT}/${f.name}.jpg`);
    const want = `${1200 * 2}x${H * 2}`;
    const got  = `${size.w}x${size.h}`;
    const bad  = got !== want;
    const flag = stale ? "STALE-BRAND" : bad ? "WRONG-SIZE"
      : blocked ? "LOCKED-STATE" : missing.length ? "EMPTY-FRAME" : "ok";
    console.log(`${flag}  ${f.name}.jpg  (y=${y}, ${got}` +
      `${bad ? ` — expected ${want}` : ""}${blocked ? ` — "${blocked}"` : ""}` +
      `${missing.length ? ` — missing ${JSON.stringify(missing)}` : ""})`);
    if (flag !== "ok") process.exitCode = 1;
  }

  console.log(`\nseeded: ${guests.length} rows · ${totalSeats} seats · ${tables.length} tables · ${EVENT.constraints.length} constraints`);
  await ctx.close();
  await browser.close();
} finally {
  server.kill();
}
