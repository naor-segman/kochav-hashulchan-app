/**
 * The three packages, and everything in them. Checklist 31.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * The feature lists were written by hand in TWO places — `PRICING_PLANS` in
 * LandingScreen.jsx and `PLANS` in PricingScreen.jsx — and they had already
 * drifted: the landing page promised "תמיכה מועדפת" and "SLA ותמיכה ייעודית",
 * neither of which existed on the pricing page a buyer would actually check,
 * and neither of which exists in the product at all. That is bug class 6, on
 * the one surface where being wrong costs money.
 *
 * One source. Both screens read it.
 *
 * ── What the model is, and where it comes from ──────────────────────────────
 * ₪690 per event, ONE-TIME. Not a subscription — a couple has one wedding, so
 * a monthly price either leaves money on the table or feels like a meter. This
 * was decided 27.7 from an 18-screenshot analysis of evenzza, who charge
 * ₪1,019–1,479 for a 400-guest wedding and sell; the earlier ₪390 guess was
 * corrected upward in that same analysis.
 *
 * The free/paid line is the one evenzza put in the same place: RSVP, the event
 * site and the guest list are free, and what costs money is the seating and
 * everything that comes OUT of it — the constraints, the real venue sketch,
 * the printing, the door.
 *
 * ── The line is NOT "automatic seating" ─────────────────────────────────────
 * Measured 20.9: DIGINET sell digital seating as a ₪100 add-on, and Lunsoul
 * give automatic seating away FREE up to 200 guests. Selling the algorithm as
 * the paywall loses to a competitor's free tier in one search. So the free tier
 * here is deliberately MORE generous than Lunsoul's — seating is free up to 200
 * people, and the guest list has no cap at all — and what is paid is the work
 * the seating feeds: constraints, the venue sketch, the printed output, the
 * entrance station, the budget.
 *
 * The arithmetic that makes this safe: an Israeli wedding is 400–650 invitees
 * (WORKPLAN, measured). A 200-person free ceiling is below the market, so the
 * generosity costs nothing and cannot be quoted against us on a comparison page.
 *
 * ── The third tier is ONE PERSON, not a package ─────────────────────────────
 * A tier with a hostess AND three call rounds prices out at ~₪1,660 of cost
 * against a ₪1,490 price — below cost, verified against measured rates. So
 * tier 3 is a single operator at the door: cost ₪450–700, margin 46–65%. Call
 * rounds are sold by the round, as work, because that is the line with the
 * worst margin.
 *
 * It also matches what the code can survive: two devices editing seating
 * during an event hit whole-event last-write-wins with no second retry
 * (useEvents.js), and the loser forfeits the venue, the whole seating map and
 * the locks. With ONE operator that cannot happen. Nothing here sells "several
 * hostesses at once" or "live updates", and nothing should.
 *
 * ── Rules for editing this file ─────────────────────────────────────────────
 * 1. Every line must be something the code does TODAY. Three things are sold
 *    through Unica by people, not by software — they carry `human: true` and
 *    are the only lines allowed to describe work rather than a feature.
 * 2. No "+ מע״מ" and no "כולל מע״מ", anywhere. The operator is a עוסק פטור:
 *    the price shown is the final price, and Israeli consumer law requires a
 *    consumer price to be displayed gross in any case.
 * 3. No invented social proof. "הכי פופולרי" is the same unearned claim as the
 *    fabricated statistics removed from the landing page, and a product with no
 *    customers has not earned it. The middle tier is emphasised by layout.
 * 4. Numbers in a Hebrew line need a Hebrew anchor or spaces around the
 *    separator — bug class 7. `690/400` reverses on screen; write
 *    "₪690 לאירוע של 400 מוזמנים".
 */

import { getPlanLimits } from "../admin/lib/planConfig.js";
import { PACKAGES, FREE_PACKAGE, GUESTS_MIN, priceFor, formatShekel } from "./pricingCurve.js";

/* ── 5.10: the per-guest model (WORKPLAN 136/139) ────────────────────────────
 * Free · "בלי הפתעות" · "עד התשובה האחרונה", the two paid ones priced by the
 * number of invited people (src/data/pricingCurve.js holds the curve). What
 * needs a person AT the event — the tier that was "אנחנו שם איתכם" ₪1,290 and
 * the ₪790 hostess — is by quote now (HUMAN_SERVICES in pricingCurve.js), and
 * the ₪6-per-invitee call add-on became the difference between the two
 * packages. Names come from pricingCurve so the stepper cards and this list
 * cannot drift. The header above records the reasoning of the flat model it
 * replaced; its rules 1–4 still hold. */
const from = (key) => `החל מ-${formatShekel(priceFor(key, GUESTS_MIN))}`;
const FREE_SEATS = getPlanLimits("free").maxSeatedSeats;

/** Sections inside a tier's list, so the page can group instead of dumping 40 bullets. */
export const PLANS = [
  {
    key: "free",
    name: FREE_PACKAGE.name,
    price: "₪0",
    per: "אירוע אחד",
    desc: "כל מה שצריך כדי לדעת מי מגיע",
    cta: "מתחילים חינם",
    ctaTo: "/signup",
    groups: [
      {
        title: "האירוע שלכם",
        items: [
          // The free tier holds ONE event (planConfig maxEvents: 1; owner, 4.10:
          // "תתקן את זה לאירוע אחד"). It listed "ריבוי אירועים" and "שכפול
          // אירוע שלם" — both make a second event, which the free tier refuses.
          "אירוע אחד, עם ספירת ימים עד היום הגדול",
          "מפת האירוע: מתי כל כלי רלוונטי, ו״המשיכו מכאן״ לשלב הבא",
          "11 סוגי אירועים — חתונה, בר ובת מצווה, ברית, חינה, עסקי ועוד",
          "זוג מאותו מין · שתי אמהות · שני אבות · הורה יחיד",
          "שמות צדדים משלכם, שעוברים לכל מסך, הדפסה וייצוא",
        ],
      },
      {
        title: "אתר לאירוע",
        items: [
          "10 ערכות צבעים, 3 גופנים ותבנית מוכנה לפי סוג האירוע",
          "מתפרסם כשאתם מוכנים — עד אז רק אתם רואים אותו",
          "ספירה לאחור, לוז האירוע, גלריה וכמה מילים עליכם",
          "מיקום עם ניווט בוויז והערת חניה",
          "הסעות: שעה, כיוון, נקודת איסוף ואיש קשר",
          "קוד לבוש, שאלות נפוצות וקיר ברכות בתוך האתר",
          "שלוש הודעות וואטסאפ מוכנות לשיתוף",
        ],
      },
      {
        title: "הזמנה ושמרו את התאריך",
        items: [
          "שתי הזמנות נפרדות, כל אחת מתפרסמת בזמן שלה",
          "10 ערכות × 3 גופנים × 3 פריסות, עם תמונת רקע",
          "ניסוח מוכן לפי סוג האירוע",
          "הוספה ליומן בלחיצה, וכרטיס הזמנה מעוצב עם קוד",
        ],
      },
      {
        title: "אישורי הגעה",
        items: [
          "קישור אחד בוואטסאפ — בלי הרשמה ובלי אפליקציה",
          "כן, אולי או לא · כמה מגיעים · שמות המלווים",
          // Five meals and an opt-out, not six meals: MEAL_OPTIONS' sixth entry
          // is { value: "none", label: "בלי ארוחה" }.
          "חמש מנות לבחירה ואפשרות ״בלי ארוחה״ — האורח בוחר בעצמו",
          "הרשמה להסעה — ואתם רואים כמה מקומות להזמין בכל נקודה",
          "התשובות נכנסות לרשימה לבד, לפי טלפון ואז לפי שם",
          "תחזית מנות עם מקדם אי-הגעה שאתם קובעים",
        ],
      },
      {
        title: "רשימת האורחים — בלי הגבלה",
        items: [
          "הדבקת רשימה מוואטסאפ או מגיליון — טלפונים, כמויות ומלווים נקראים לבד",
          "מסך אישור לפני שמשהו נכנס, עם סימון כפילויות",
          "צדדים, 13 קבוצות משפחה או 8 עסקיות, וקבוצות משלכם",
          "מנה, מתנה משוערת והערות לכל אורח",
          "סינון, עדכון קבוצתי ופילוח חי",
          "טבלה שיתופית: המשפחה ממלאת מהטלפון, בזמן אמת, בלי חשבון",
          "ייצוא לאקסל",
        ],
      },
      {
        title: "הודעות, מתנות ותמונות",
        items: [
          // "מעקב מי כבר קיבל" was a claim about the GUEST. markSent() fires on
          // the click, before window.open, and nothing ever revisits it
          // (MessagesScreen.jsx:203-205) — the screen's own hint says you still
          // have to press send inside WhatsApp. The app knows what you sent,
          // not what arrived.
          "רצף שש הודעות עם קהל יעד אוטומטי וסימון מי כבר נשלח",
          "תבניות שאתם עורכים, עם שם, תאריך, מקום, שולחן וקישור",
          "השליחה מהוואטסאפ שלכם — בלי עלות",
          // This said "מתנות באשראי" and that was FALSE as software. GiftScreen
          // has a name, an amount and a blessing — no card field, no clearing
          // call, no redirect; submit_gift_by_token writes `paid = false` and
          // nothing ever flips it; and the guest's own confirmation screen says
          // "את המתנה עצמה אפשר להעניק ביום האירוע". /services/gifts on the
          // same site already said the honest version, so the site gave two
          // answers and the false one was on the page with the price.
          //
          // Unica's card clearing is real, which is why the SERVICE stays — it
          // is in the FAQ, described as what it is. What the software does is
          // the declaration, the blessing and the projected wall, and that is
          // all this line may claim.
          "הצהרת מתנה וברכה מהאורח, וקיר ברכות שמוקרן על מסך באולם — בלי סכומים",
          "אלבום משותף — האורחים מעלים תמונות לקישור אחד",
        ],
      },
      {
        title: "ועוד",
        items: [
          // Not "לאורחים": three of the ten are not for guests at all —
          // `entrance` is the greeter station, `collab` is the family's edit
          // table, `giftWall` is the projector feed.
          "עשרה קישורים לשיתוף, לכל אחד קוד QR להורדה",
          // Not "עבודה מכמה מכשירים". This file's own header (see above) uses
          // the opposite fact to justify a single operator in tier 3: two
          // devices editing seating at once hit whole-event last-write-wins and
          // the loser forfeits the venue, the map and the locks. Sequential
          // access from any device is true; simultaneous editing is the hazard.
          "סנכרון ענן, גישה מכל מכשיר ואפליקציה להתקנה",
          `הושבה אוטומטית עד ${FREE_SEATS} איש`,
        ],
      },
    ],
  },

  {
    key: "event",
    name: PACKAGES[0].name,
    price: from("auto"),
    per: "לפי מספר המוזמנים",
    // "במחיר של שתי מנות באולם" put a hall meal at ₪345. Nothing in the repo
    // sources that number, and rule 3 above bans an unearned one.
    desc: "כל הערב מסודר — מההושבה ועד הדלת",
    cta: "קונים את האירוע",
    ctaTo: "/signup",
    highlight: true,
    note: "תשלום אחד לאירוע. לא מנוי.",
    inherits: "כל מה שבחינם, ועוד:",
    groups: [
      {
        title: "וואטסאפ שיוצא לבד",
        items: [
          "ההזמנה נשלחת אוטומטית, וסבב שני רק למי שלא ענה",
          "תזכורת לפני האירוע ותודה אחריו",
          "מספר השולחן נשלח לכל אורח ביום האירוע",
        ],
      },
      {
        title: "ההושבה — בלי תקרה",
        items: [
          "מי חייב לשבת יחד ומי בשום אופן לא — אתם אומרים, המערכת מסדרת",
          "אילוץ שלא הסתדר מסומן לכם, ולא נבלע",
          "נעילת אורח ונעילת שולחן, שנשמרות גם בחישוב מחדש",
          "גרירה ידנית, וביטול של עשרים הפעולות האחרונות",
          "שולחן מלא פשוט לא מקבל עוד אחד",
        ],
      },
      {
        title: "מפת האולם האמיתית",
        items: [
          "מעלים את סקיצת האולם — והמערכת מזהה את השולחנות מהתמונה",
          "ארבע צורות שולחן, ושמונה אלמנטים: חופה, במה, בופה, בר, רחבה, DJ, כניסה וקופסת מתנות",
          "גרירה ושינוי גודל, כדי שהצ׳יפ יתאים לשולחן האמיתי",
          "משפחה שלא נכנסה נשפכת לשולחן שפיזית לידה, לא לריק ביותר",
        ],
      },
      {
        title: "שולחנות ועוזר חכם",
        items: [
          "הוספת עשרה שולחנות בפעולה אחת, ממוספרים לבד",
          "חמישה סוגי שולחן — רגיל, אביר, VIP, בר וקטן — ועוד משלכם",
          "אזהרה חיה כשחסרים מקומות לאורחים",
          "ציון 0 עד 100 ושנים-עשר סוגי הצעות שיפור, כל אחת עם נימוק",
          "החלת הצעה בלחיצה אחת",
        ],
      },
      {
        title: "יום האירוע",
        items: [
          "עמדת כניסה: חיפוש בשם, בשם מלווה או בטלפון",
          "סימון הגעה לכל אדם בנפרד — הדודה הגיעה, הילדים עוד לא",
          // Not "בזמן אמת": the greeter's device re-polls every 25 seconds
          // (EntranceScreen.jsx:222), there is no push, and two greeters can be
          // that far out of date with each other.
          "סימון שולחן שלם בלחיצה, ומקומות פנויים שמתעדכנים כל כמה שניות",
          "אורח שלא הוזמן — נכנס, ומקבל שולחן שיש בו מקום עכשיו",
          "קישור נפרד לדיילת, בלי גישה לשאר האירוע ובלי טלפונים",
          "מתג שסוגר את הסימון אחרי האירוע, בלי לבטל את הקישור",
        ],
      },
      {
        title: "להדפסה",
        items: [
          "ארבעה סוגי כרטיסי שם: כרטיס שולחן מתקפל, כרטיס מקום, תג ענידה ומדבקה",
          "כרטיס מקום לכל כיסא — זוג מקבל שניים",
          "סידור הושבה מלא, וגיליון דחוס לצוות האולם",
          // "רשימת כניסה לפי א׳-ב׳" was here and there is no such PRINTOUT. The
          // app has exactly two print surfaces — NameTagsScreen and
          // SeatingScreen — and every mode of both is ordered by table. The
          // alphabetical list exists only as Excel sheet 3, which the ייצוא
          // group below already sells.
          "בחירה למי מדפיסים: רק משובצים, רק מי שאישר, או כולם",
        ],
      },
      {
        title: "תקציב, ספקים ומשימות",
        items: [
          "מתוכנן מול בפועל, עלות לאורח וגרפים — נשמר לבד",
          "קטגוריות שאתם עורכים, ומילוי מהיר של מתנה משוערת לכולם",
          "ספקים: אחת-עשרה קטגוריות, מהצעה עד סגירה, ומעקב תשלומים",
          // "כשהלוח ריק" is not a hedge: the loader button lives inside
          // {tasks.length === 0 && …} in both places it is rendered
          // (TasksScreen.jsx:112, :168), so one task of your own makes the
          // starter list permanently unreachable.
          "לוח משימות עם תאריכי יעד, ורשימת התחלה לפי סוג האירוע כשהלוח ריק",
          "הסתרת ברכה מקיר הברכות באמצע האירוע, והחזרה שלה",
        ],
      },
      {
        title: "ייצוא",
        items: [
          // This said "חוברת אקסל בחמישה גיליונות … ומתנות" and both halves were
          // wrong. Only two sheets are unconditional — sheet 1 סידור הושבה
          // (exportHelpers.js:215) and sheet 3 רשימת כניסה א׳-ב׳ (:276).
          // ממתינים (:219) and הפרות (:280) appear only when there are any, so
          // the normal pre-event export is two or three sheets, not five — and
          // "הפרות" is a tab that only exists when the plan is broken.
          //
          // The gift sheet is gone from the sentence for a harder reason: it
          // reads `Number(g.giftAmount)` (:302) and NOTHING in src/ ever writes
          // giftAmount — the door deliberately has no gift field, and the two
          // UIs for it were removed on purpose (SeatingScreen.jsx:549,
          // CostScreen.jsx:462). Every row and every total prints ₪0. Selling a
          // gift ledger that is structurally empty is the same failure as the
          // "רישום מתנות" claim already retracted from the landing page.
          "ייצוא לאקסל: סידור הושבה ורשימת כניסה לפי א׳-ב׳, ועוד גיליון לממתינים לשיבוץ ולהפרות אילוצים כשיש כאלה",
        ],
      },
    ],
  },

  {
    key: "calls",
    name: PACKAGES[1].name,
    price: from("calls"),
    per: "לפי מספר המוזמנים",
    desc: PACKAGES[1].lead,
    cta: "מחשבים את המחיר",
    ctaTo: "/pricing",
    note: "תשלום אחד לאירוע. לא מנוי.",
    inherits: "כל מה שב״בלי הפתעות״, ועוד:",
    groups: [
      {
        title: "סבבי שיחות",
        human: true,
        items: [
          "נציג אנושי מתקשר לכל מי שלא ענה בוואטסאפ",
          "כל תשובה נכנסת לרשימה שלכם לבד",
          "אתם לא מתקשרים לאף אחד",
        ],
      },
    ],
  },
];

/**
 * This file's keys → the keys the database and planConfig.js use.
 *
 * The two sets of names are not a mistake and cannot be merged: `free` / `event`
 * / `calls` describe the packages as a buyer meets them, while `free` / `pro` /
 * `enterprise` are the values already written into `subscriptions.plan`, which
 * carries a CHECK constraint — renaming them is a migration plus a Stripe
 * metadata change, not an edit.
 *
 * It exists as a map rather than as knowledge in someone's head because the two
 * sides had already drifted once: the package NAMES are written out by hand in
 * both files, pinned by tests on both sides, and nothing tied them together. The
 * tests in pricing.test.js use this to compare them.
 */
export const PLAN_DB_KEY = { free: "free", event: "pro", calls: "enterprise" };

/** The line under the table. It answers the three fears at once. */
export const PRICING_FOOTNOTE =
  "תשלום אחד לאירוע — לא מנוי. המחיר לפי מספר המוזמנים, ואתם רואים אותו לפני שמשלמים.";
