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
 * `flag: true` would keep a link visible in the bar instead of the dropdown.
 * Seating had it until 6.10, when the owner found "סידורי הושבה" beside
 * "השירותים ▾" confusing — it read as if it were not one of the services. No
 * service carries it now; the seating story is told on the home page.
 */

/* `mark` is a SectionMark glyph name (components/ui/SectionMark.jsx). It lives
 * here rather than in the landing page so the icon travels with the service —
 * the home-page grid, and anything else that lists services, read it from one
 * place. Every value below resolves; `planning` maps to `tasks` and `day` to
 * `checkin`, which are the screens behind those headings. */
/* The order is the host's JOURNEY (owner, 6.10: "בסדר כרונולוגי… מסע של תכנון
 * האירוע, תהליך האירוע והאירוע עצמו"): plan, invite, hear back, seat, the
 * day, the gifts. Every list reads this order. The blurbs speak to the person,
 * not about the feature (6.10: "לא מושך, או לא מעביר באמת את מה שיש שם"). */
export const SERVICES = [
  {
    id: "planning",
    mark: "tasks",
    path: "/services/planning",
    label: "תכנון האירוע",
    // Shown under the label in the dropdown. One line, no full stop.
    // Not "ראש שקט" — that is the competitor's line (owner, 6.10).
    blurb: "כל ההכנות במקום אחד, בלי לשכוח כלום",
    when: "לקראת האירוע",
    live: true,
  },
  {
    id: "site",
    mark: "site",
    path: "/services/event-site",
    label: "הזמנה ואתר האירוע",
    blurb: "הזמנה שכיף לפתוח",
    when: "לקראת האירוע",
    live: true,
  },
  {
    id: "rsvp",
    mark: "rsvp",
    path: "/services/rsvp",
    label: "אישורי הגעה",
    blurb: "יודעים מי מגיע, בלי לרדוף אחרי אף אחד",
    when: "לקראת האירוע",
    live: true,
  },
  {
    id: "seating",
    mark: "seating",
    path: "/services/seating",
    label: "סידורי הושבה",
    blurb: "כל האולם מסודר בלחיצה אחת",
    when: "לקראת האירוע",
    live: true,
  },
  {
    id: "day",
    mark: "checkin",
    path: "/services/event-day",
    label: "יום האירוע",
    blurb: "קבלת פנים חלקה מהרגע הראשון",
    when: "ביום האירוע",
    live: true,
  },
  {
    id: "gifts",
    mark: "gifts",
    path: "/services/gifts",
    // Owner, 6.10: the card payment stays in the name — it is built when the
    // clearing is (90), not cut now and re-added later. "וברכות" is his.
    label: "מתנות באשראי וברכות",
    blurb: "כל ברכה נשמרת לתמיד",
    when: "ביום האירוע",
    live: true,
  },
];

/** The services with a page behind them. Navigation reads only this. */
export const liveServices = () => SERVICES.filter(s => s.live);

/** No service has its own slot in the bar any more (owner, 6.10: "סידורי
 *  הושבה" beside "השירותים ▾" read as if it were not one of them). Kept as a
 *  function so a future flag is one field, not a header rewrite. */
export const flagService = () => SERVICES.find(s => s.flag && s.live) || null;

/** Every live service that is not the flag, for the dropdown, in journey order. */
export const menuServices = () => SERVICES.filter(s => s.live && !s.flag);

export const serviceById = id => SERVICES.find(s => s.id === id) || null;
