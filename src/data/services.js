/**
 * The six services the marketing site sells, in the order a host meets them.
 * Checklist 87.
 *
 * ── Why this is a data file and not six hardcoded links ─────────────────────
 * The landing page already made the other mistake once: `FEATURES` in
 * LandingScreen.jsx is six hand-written items that do not derive from anything,
 * and the product drifted past it — sixteen screens exist, that array names six
 * of them, and tasks, budget, vendors, messages and name tags appear nowhere.
 * The header, the dropdown, the footer and the service pages all read this
 * file, so a seventh service is one entry rather than four edits.
 *
 * ── `live` is the honest half ───────────────────────────────────────────────
 * A service only appears in navigation once the page behind the link exists.
 * They are added one per commit, in the build order agreed on 10.9:
 *
 *   1. seating   🚩  the flag — everything it needs is built
 *   2. site          built
 *   3. planning      built
 *   4. rsvp          built; 88 (per-stage links) and 89 (phone rounds) quarantined
 *   5. day           built; 89 (hostesses, on-site seating manager) quarantined
 *   6. gifts         built; 90 (card charging) quarantined
 *
 * All six are live. The last three describe things that do not exist yet, at
 * the owner's explicit instruction and on his explicit condition — the site is
 * not published until they are built. Every unbuilt claim on those pages lives
 * in one `COMING` array per page; grep COMING_NOT_BUILT. `gifts` is the widest
 * gap of the three: the label the owner chose is "מתנות באשראי" and charging a
 * card is checklist 90, which is blocked on a clearing agreement (46) before it
 * is blocked on code.
 *
 * `flag: true` means the link stays visible in the bar rather than moving into
 * the dropdown when the others arrive. There is exactly one, deliberately: the
 * automatic seating is what makes this product different from the competitors,
 * and hiding it behind a click to tidy the bar would be tidying away the point.
 */

/* `mark` is a SectionMark glyph name (components/ui/SectionMark.jsx). It lives
 * here rather than in the landing page so the icon travels with the service —
 * the home-page grid, and anything else that lists services, read it from one
 * place. Every value below resolves; `planning` maps to `tasks` and `day` to
 * `checkin`, which are the screens behind those headings. */
export const SERVICES = [
  {
    id: "seating",
    mark: "seating",
    path: "/services/seating",
    label: "סידורי הושבה",
    // Shown under the label in the dropdown. One line, no full stop.
    blurb: "האלגוריתם מסדר את כל האולם בשניות",
    when: "לקראת האירוע",
    flag: true,
    live: true,
  },
  {
    id: "site",
    mark: "site",
    path: "/services/event-site",
    label: "אתר לאירוע והזמנה",
    blurb: "הזמנה דיגיטלית, אתר, Waze והסעות",
    when: "לקראת האירוע",
    live: true,
  },
  {
    id: "rsvp",
    mark: "rsvp",
    path: "/services/rsvp",
    label: "אישורי הגעה",
    blurb: "וואטסאפ, תזכורות וסבבי שיחות",
    when: "לקראת האירוע",
    live: true,
  },
  {
    id: "planning",
    mark: "tasks",
    path: "/services/planning",
    label: "תכנון האירוע",
    blurb: "משימות, תקציב וספקים",
    when: "לקראת האירוע",
    live: true,
  },
  {
    id: "day",
    mark: "checkin",
    path: "/services/event-day",
    label: "יום האירוע",
    blurb: "עמדת כניסה, דיילות וכרטיסי שם",
    when: "ביום האירוע",
    live: true,
  },
  {
    id: "gifts",
    mark: "gifts",
    path: "/services/gifts",
    label: "מתנות באשראי",
    blurb: "מתנה, ברכה וקיר ברכות",
    when: "ביום האירוע",
    live: true,
  },
];

/** The services with a page behind them. Navigation reads only this. */
export const liveServices = () => SERVICES.filter(s => s.live);

/** The flag, if it is live — it gets its own slot in the bar. */
export const flagService = () => SERVICES.find(s => s.flag && s.live) || null;

/** Everything else that is live, for the dropdown. */
export const menuServices = () => SERVICES.filter(s => s.live && !s.flag);

export const serviceById = id => SERVICES.find(s => s.id === id) || null;
