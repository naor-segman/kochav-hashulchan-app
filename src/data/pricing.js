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

/** Sections inside a tier's list, so the page can group instead of dumping 40 bullets. */
export const PLANS = [
  {
    key: "free",
    name: "הרשימה בידיים",
    price: "₪0",
    per: "אירוע אחד",
    desc: "כל מה שצריך כדי לדעת מי מגיע",
    cta: "מתחילים חינם",
    ctaTo: "/signup",
    groups: [
      {
        title: "האירוע שלכם",
        items: [
          "ריבוי אירועים בלוח אחד, עם ספירת ימים לכל אחד",
          "שכפול אירוע שלם — שולחנות, אורחים, אילוצים וספקים",
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
          "שש מנות לבחירה, והאורח בוחר בעצמו",
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
          "רצף שש הודעות עם קהל יעד אוטומטי ומעקב מי כבר קיבל",
          "תבניות שאתם עורכים, עם שם, תאריך, מקום, שולחן וקישור",
          "השליחה מהוואטסאפ שלכם — בלי עלות",
          "מתנות באשראי, וקיר ברכות שמוקרן על מסך באולם",
          "אלבום משותף — האורחים מעלים תמונות לקישור אחד",
        ],
        // The gift line is the only one here delivered outside the app: the
        // guest's card is cleared through Unica's existing arrangement, which
        // is what makes it sellable at all. The declaration, the blessing and
        // the projected wall are the product's own.
      },
      {
        title: "ועוד",
        items: [
          "עשרה קישורים לאורחים, לכל אחד קוד QR להורדה",
          "סנכרון ענן, עבודה מכמה מכשירים ואפליקציה להתקנה",
          "הושבה אוטומטית עד 200 איש — לצפייה במסך",
        ],
      },
    ],
  },

  {
    key: "event",
    name: "בלי הפתעות",
    price: "₪690",
    per: "לאירוע",
    desc: "כל הערב מסודר, במחיר של שתי מנות באולם",
    cta: "קונים את האירוע",
    ctaTo: "/signup",
    highlight: true,
    note: "תשלום אחד לאירוע. לא מנוי.",
    inherits: "כל מה שבחינם, ועוד:",
    groups: [
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
          "ציון 0–100 ושנים-עשר סוגי הצעות שיפור, כל אחת עם נימוק",
          "החלת הצעה בלחיצה אחת",
        ],
      },
      {
        title: "יום האירוע",
        items: [
          "עמדת כניסה: חיפוש בשם, בשם מלווה או בטלפון",
          "סימון הגעה לכל אדם בנפרד — הדודה הגיעה, הילדים עוד לא",
          "סימון שולחן שלם בלחיצה, ומקומות פנויים בזמן אמת",
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
          "רשימת כניסה לפי א׳-ב׳",
          "בחירה למי מדפיסים: רק משובצים, רק מי שאישר, או כולם",
        ],
      },
      {
        title: "תקציב, ספקים ומשימות",
        items: [
          "מתוכנן מול בפועל, עלות לאורח וגרפים — נשמר לבד",
          "קטגוריות שאתם עורכים, ומילוי מהיר של מתנה משוערת לכולם",
          "ספקים: אחת-עשרה קטגוריות, מהצעה עד סגירה, ומעקב תשלומים",
          "לוח משימות עם רשימת התחלה מוכנה לפי סוג האירוע ותאריכי יעד",
          "הסתרת ברכה מקיר הברכות באמצע האירוע, והחזרה שלה",
        ],
      },
      {
        title: "ייצוא",
        items: [
          "חוברת אקסל בחמישה גיליונות: הושבה, ממתינים, רשימת כניסה, הפרות ומתנות",
        ],
      },
    ],
  },

  {
    key: "onsite",
    name: "אנחנו שם איתכם",
    price: "₪1,290",
    per: "לאירוע",
    desc: "מישהו שלנו עומד בדלת ומקבל את האורחים",
    cta: "בדקו אם התאריך פנוי",
    ctaTo: "/signup",
    inherits: "כל מה שב״בלי הפתעות״, ועוד:",
    groups: [
      {
        title: "בערב האירוע",
        human: true,
        items: [
          "מנהל הושבה שלנו בכניסה, לאורך כל קבלת הפנים",
          "מקבל את המגיעים, מצמיד לשולחן ומטפל בשינויים במקום",
          "ההושבה נבנית איתו לפני האירוע — לא נמסרת לכם כקובץ",
          "תרשים האולם וכרטיסי השם מגיעים מודפסים",
          "ליווי אישי מההקמה ועד הערב",
        ],
      },
    ],
  },
];

/**
 * Sold by the hour, not bundled. These are the lines whose cost scales with
 * people rather than with software, and burying them in a tier is how a
 * package ends up priced below what it costs to deliver.
 */
export const ADDONS = [
  {
    title: "סבב שיחות למי שלא ענה",
    price: "₪6 למוזמן",
    note: "מינימום ₪300",
    body: "מתקשרים לכל מי שלא ענה בוואטסאפ, ומעדכנים את הרשימה.",
  },
  {
    title: "דיילת נוספת בכניסה",
    price: "₪790",
    note: "לערב",
    body: "לאירועים גדולים, או כשיש שתי כניסות.",
  },
];

/** The line under the table. It answers the three fears at once. */
export const PRICING_FOOTNOTE =
  "תשלום אחד לאירוע — לא מנוי, לא לפי מספר אורחים, והמחיר שאתם רואים הוא המחיר הסופי.";

/** The three tiers as the landing page teases them: name, price, four lines. */
export const teaserFor = (plan) => ({
  key: plan.key,
  name: plan.name,
  price: plan.price,
  per: plan.per,
  desc: plan.desc,
  cta: plan.cta,
  ctaTo: plan.ctaTo,
  highlight: !!plan.highlight,
  // The first item of each of the first four groups — enough to tell the tiers
  // apart without reprinting forty lines on a page whose job is elsewhere.
  lines: plan.groups.slice(0, 4).map(g => g.items[0]),
});
