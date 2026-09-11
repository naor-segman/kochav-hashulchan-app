import { SERVICES } from "./services.js";
import { COMPANY, DESCRIPTOR } from "./company.js";

/**
 * Per-route <title>, description and canonical for every INDEXABLE page.
 * Checklist 87 (the SEO gap) and 52 (robots + sitemap).
 *
 * ── The problem this fixes ──────────────────────────────────────────────────
 * Measured in a browser, 10.9: `/home`, `/pricing` and all six `/services/*`
 * served **the same `<title>`, the same `<meta name="description">` and no
 * `<link rel="canonical">` at all** — because this is a single-page app with one
 * `index.html`. Six landing pages were built to be found on "סידורי הושבה" and
 * "אישורי הגעה", and to Google they were one page. A WhatsApp preview of any of
 * them showed the generic site title, which is checklist 70's bug in different
 * routes.
 *
 * ── Why this file, and not a table inside the build script ──────────────────
 * It is read by BOTH ends and there is exactly one copy:
 *
 *   build time  `vite.config.js` writes a real dist/<path>/index.html per entry,
 *               with the head rewritten, plus dist/sitemap.xml. A crawler gets a
 *               correct document without running any JavaScript, and Netlify's
 *               SPA fallback never sees the request because a real file wins.
 *   run time    <PageMeta> in App.jsx sets document.title / description /
 *               canonical on every client-side navigation, so the tab is right
 *               when someone clicks through the header rather than landing cold.
 *
 * The services half is DERIVED from SERVICES rather than retyped: bug class 6 in
 * CLAUDE.md is a hand-maintained duplicate drifting, and `supabase/setup_full.sql`
 * fell seven migrations behind that way. `SERVICE_SEO` is keyed by service id and
 * `seo.test.js` fails if a live service has no entry or an entry has no service,
 * so a seventh service cannot be added without its metadata.
 */

/* Per-service copy. Keyed by id — the path and the nav label come from
   services.js, so a route can only be renamed in one place.

   Written for what a host TYPES into Google, not for what we call it
   internally: nobody searches "אתר לאירוע והזמנה", they search
   "הזמנה דיגיטלית לחתונה". */
const SERVICE_SEO = {
  seating: {
    title: "סידור הושבה אוטומטי לחתונה ולאירועים",
    description: "מעלים רשימת אורחים, מגדירים מי חייב לשבת עם מי ומי לא, ומקבלים סידור שולחנות מלא בשניות. גרירה ידנית, נעילת שולחנות ובדיקת אילוצים.",
  },
  site: {
    title: "אתר לאירוע והזמנה דיגיטלית",
    description: "אתר אירוע בעברית עם הזמנה דיגיטלית, ניווט בוויז, לוח זמנים, הסעות ושאלות נפוצות — בלי מעצב ובלי מתכנת.",
  },
  rsvp: {
    title: "אישורי הגעה בוואטסאפ לחתונה",
    description: "קישור אחד שהאורח פותח בטלפון, עונה בלי הרשמה, והרשימה מתעדכנת אצלכם. כולל תחזית מנות, מנות מיוחדות והרשמה להסעות.",
  },
  planning: {
    title: "תכנון אירוע — משימות, תקציב וספקים",
    description: "לוח משימות עם תאריכי יעד, תקציב מול ביצוע לפי קטגוריות, ורשימת ספקים עם סטטוס ותשלומים. הכל במקום אחד.",
  },
  day: {
    title: "עמדת כניסה לאירוע וכרטיסי שם",
    description: "מי שעומד בדלת מחפש שם ורואה מיד את מספר השולחן, מסמן הגעה, ומדפיס כרטיסי שם ומפת הושבה לאולם.",
  },
  gifts: {
    title: "מתנות וברכות — קיר ברכות לאירוע",
    description: "האורח כותב ברכה ובוחר סכום, והברכה עולה על מסך באולם — בלי סכומים. אצלכם נשמרת רשימה של מי הצהיר על מה.",
  },
};

/* The non-service pages. `/` and `/home` render the same screen and therefore
   share one canonical — pointing both at /home would make the site's front door
   a duplicate of itself in Google's index. */
const STATIC_PAGES = [
  {
    path: "/",
    title: `${COMPANY.name} — ${DESCRIPTOR}`,
    description: "סדרו הושבה לחתונה או לכל אירוע בקלות — אורחים, אילוצים וסידור שולחנות אוטומטי. אישורי הגעה, אתר לאירוע וקיר ברכות, הכל במקום אחד.",
    priority: "1.0",
  },
  {
    // Same screen as "/", so it is NOT a second indexable page: its canonical
    // points home. Without that, the two routes compete for the same query.
    path: "/home",
    canonical: "/",
    title: `${COMPANY.name} — ${DESCRIPTOR}`,
    description: "סדרו הושבה לחתונה או לכל אירוע בקלות — אורחים, אילוצים וסידור שולחנות אוטומטי. אישורי הגעה, אתר לאירוע וקיר ברכות, הכל במקום אחד.",
    sitemap: false,
  },
  {
    path: "/pricing",
    title: "מחירים",
    description: `המסלולים של ${COMPANY.name} — מה נכלל בכל אחד, ומה מתאים לאירוע שלכם.`,
    priority: "0.8",
  },
  {
    path: "/help",
    title: "שאלות נפוצות",
    description: "התשובות לשאלות שנשאלות הכי הרבה — הושבה, אישורי הגעה, אתר האירוע, מתנות ופרטיות.",
    priority: "0.5",
  },
  { path: "/terms",         title: "תנאי שימוש",      description: `תנאי השימוש בשירותי ${COMPANY.name}.`, priority: "0.2" },
  { path: "/privacy",       title: "מדיניות פרטיות",   description: `איזה מידע ${COMPANY.name} שומרת, למה, ולמי הוא נגיש.`, priority: "0.2" },
  { path: "/accessibility", title: "הצהרת נגישות",     description: `הצהרת הנגישות של ${COMPANY.name} ודרכי הפנייה לרכז הנגישות.`, priority: "0.2" },
];

/**
 * Every indexable page, with its head resolved.
 *
 * A live service with no SEO_SERVICE entry is SKIPPED, not read through — the
 * first version did `SERVICE_SEO[s.id].title` and a deliberate mutation proved
 * why that is wrong: removing one entry threw a TypeError at module scope, so
 * the test file failed to load and reported "no tests" instead of naming the
 * missing service, and in the browser it would have taken down every route that
 * imports App.jsx, not just the page with no metadata. A missing entry should
 * cost that one page its custom title and nothing else. `seoServiceIds()` and
 * the test below are what make sure it never stays missing.
 */
export const SEO_PAGES = [
  ...STATIC_PAGES,
  ...SERVICES.filter(s => s.live && SERVICE_SEO[s.id]).map(s => ({
    path: s.path,
    title: SERVICE_SEO[s.id].title,
    description: SERVICE_SEO[s.id].description,
    priority: "0.9",
  })),
];

/**
 * The full <title>. Every page except the home page carries the brand as a
 * suffix — "מחירים" alone is a title a hundred Israeli sites already have, and
 * the name on its own means nothing to someone who has never heard it, which is
 * why DESCRIPTOR exists in company.js.
 */
export function pageTitle(page) {
  return page.path === "/" || page.path === "/home"
    ? page.title
    : `${page.title} · ${COMPANY.name}`;
}

/** The absolute canonical URL for a page. */
export function pageCanonical(page) {
  return COMPANY.site + (page.canonical ?? page.path);
}

/** The entry for a pathname, or null when the route is not an indexable page. */
export function seoFor(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return SEO_PAGES.find(p => p.path === clean) || null;
}

/** The ids this file carries copy for — used by the test that pins the two. */
export const seoServiceIds = () => Object.keys(SERVICE_SEO);
