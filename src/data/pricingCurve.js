/**
 * Price by the number of invited people — WORKPLAN 136/139, owner 5.10.
 *
 * The model, as the owner approved it after seeing DIGINET's packages page:
 *   • free, to try — everything self-serve;
 *   • TWO self-serve packages, bought online without talking to anyone,
 *     priced by how many people are invited (a stepper, 100–1,000 in steps of
 *     50). The ONLY difference between them is the human call rounds;
 *   • anything that needs a person AT the event is by quote.
 *
 * The unit is PEOPLE, not guest-list rows. A row is one phone and our message
 * cost is per row (Meta bills per template message), but a 500-person wedding
 * is roughly 300 rows and pricing by rows would cut the revenue of the event
 * our pricing is built around. People is also the number every couple already
 * knows — no "what counts as a row?" link.
 *
 * DRAFT NUMBERS. Package B's step over A has to cover the human call rounds,
 * whose cost the owner is still working out (WORKPLAN 125). A was set against
 * the Meta rates on record (WORKPLAN, $0.0353 marketing / $0.0053 utility): all
 * messages for one row come to about ₪0.22–0.31, so the margin is safe at
 * every point on the curve.
 */

import { PLAN_LIMITS } from "../admin/lib/planConfig.js";

export const GUESTS_MIN  = 100;
export const GUESTS_MAX  = 1000;
export const GUESTS_STEP = 50;
export const GUEST_PRESETS = [150, 300, 500, 800];

/* Anchor points every 100 people. Between them the price is interpolated and
   then pulled to the nearest number ending in 9. */
const ANCHORS = {
  auto:  { 100: 149, 200: 249, 300: 349, 400: 449, 500: 529, 600: 599, 700: 659, 800: 719, 900: 769, 1000: 819 },
  calls: { 100: 249, 200: 429, 300: 599, 400: 769, 500: 919, 600: 1049, 700: 1169, 800: 1279, 900: 1389, 1000: 1489 },
};

/** Clamp any typed number onto the stepper's grid. */
export function snapGuests(n) {
  const v = Math.round(Number(n) / GUESTS_STEP) * GUESTS_STEP;
  if (!Number.isFinite(v)) return GUESTS_MIN;
  return Math.min(GUESTS_MAX, Math.max(GUESTS_MIN, v));
}

/** How many PEOPLE a guest list prices at — the same count the seating gate
    uses (featureGates canSeatMore): a row is `count` people, a bare row is one,
    an empty row is nobody, and people who declined are not coming. The event
    card counted the declined too, so a list of 90 coming and 40 declined was
    priced at 150 while the gate said it was inside the free 100. */
export function peopleIn(guests) {
  return (Array.isArray(guests) ? guests : [])
    .filter(Boolean)
    .filter(g => g.rsvp !== "declined")
    .reduce((n, g) => n + Math.max(1, Number(g.count) || 1), 0);
}

/** The step that covers `people` invited — rounded UP, never to the nearest:
    an event of 320 is the 350 step, or the price would cover fewer people than
    are coming. `null` above the stepper's top, where the price is a quote. */
export function stepFor(people) {
  const n = Math.max(0, Number(people) || 0);
  if (n > GUESTS_MAX) return null;
  return Math.max(GUESTS_MIN, Math.ceil(n / GUESTS_STEP) * GUESTS_STEP);
}

const endIn9 = (v) => Math.max(9, Math.round((v + 1) / 10) * 10 - 1);

/** The price of package `key` ("auto" | "calls") for `guests` people. */
export function priceFor(key, guests) {
  const a = ANCHORS[key];
  if (!a) return null;
  const g = snapGuests(guests);
  const lo = Math.floor(g / 100) * 100;
  const hi = Math.min(GUESTS_MAX, lo + 100);
  if (a[g] != null) return a[g];
  const t = (g - lo) / (hi - lo);
  return endIn9(a[lo] + (a[hi] - a[lo]) * t);
}

export const formatShekel = (n) => "₪" + Number(n).toLocaleString("en-US");

/** The lowest price of any paid package — the "from" line on the home page. */
export const PAID_FROM = Math.min(ANCHORS.auto[GUESTS_MIN], ANCHORS.calls[GUESTS_MIN]);

export const FREE_PACKAGE = {
  key: "free",
  name: "הרשימה בידיים",
  price: "₪0",
  lead: "מתחילים בלי כרטיס אשראי ובלי התחייבות",
  lines: [
    { ok: true,  t: "הזמנה דיגיטלית ואתר לאירוע" },
    { ok: true,  t: "אישורי הגעה בקישור — האורחים לא נרשמים" },
    { ok: true,  t: "שליחה מהוואטסאפ שלכם, בלי הגבלה" },
    { ok: true,  t: "רשימת אורחים בלי הגבלה" },
    // From the gate itself, so the card and the limit cannot disagree.
    { ok: true,  t: `הושבה אוטומטית עד ${PLAN_LIMITS.free.maxSeatedSeats} מוזמנים` },
    { ok: false, t: "שליחה אוטומטית בוואטסאפ" },
    { ok: false, t: "אילוצי ישיבה ומפת האולם" },
  ],
  cta: "מתחילים חינם",
};

export const PACKAGES = [
  {
    key: "auto",
    name: "בלי הפתעות",
    lead: "הכל קורה לבד — ההזמנות, התזכורות וההושבה",
    lines: [
      { ok: true,  t: "וואטסאפ אוטומטי: הזמנה, וסבב שני למי שלא ענה" },
      { ok: true,  t: "תזכורת לפני האירוע ותודה אחריו" },
      { ok: true,  t: "מספר השולחן נשלח לכל אורח ביום האירוע" },
      { ok: true,  t: "הושבה אוטומטית בלי תקרה" },
      { ok: true,  t: "מי יושב יחד ומי בשום אופן לא — אילוצים ונעילות" },
      { ok: true,  t: "מפת האולם, עמדת כניסה וכרטיסי שם להדפסה" },
      { ok: false, t: "סבבי שיחות טלפון" },
    ],
  },
  {
    key: "calls",
    name: "עד התשובה האחרונה",
    lead: "ומי שלא ענה בוואטסאפ — מקבל טלפון מאיתנו",
    highlight: true,
    lines: [
      { ok: true,  t: "כל מה שב״בלי הפתעות״" },
      { ok: true,  t: "סבבי שיחות של נציג אנושי למי שלא ענה" },
      { ok: true,  t: "כל תשובה נכנסת לרשימה שלכם לבד" },
      { ok: true,  t: "אתם לא מתקשרים לאף אחד" },
    ],
  },
];

/* Things that need people at the event — never a fixed price, because the
   cost is a person's evening, travel and the venue, and one person cannot be
   at two weddings on the same night. */
export const HUMAN_SERVICES = [
  { mark: "checkin", title: "מנהל הושבה בכניסה",   body: "מקבל את האורחים, מכוון לשולחן ומטפל בשינויים של הרגע האחרון." },
  { mark: "hostess", title: "עמדת קבלת פנים",      body: "דיילות בכניסה, כרטיסי שם מודפסים לפי סידור ההושבה." },
  { mark: "tasks",   title: "ניהול האירוע",        body: "מישהו שלנו מחזיק את כל הערב — מהספקים ועד הסוף." },
];

export const PRICING_RULES = [
  "תשלום אחד לאירוע",
  "בלי מנוי",
  "משדרגים בכל רגע — ומשלמים רק את ההפרש",
];
