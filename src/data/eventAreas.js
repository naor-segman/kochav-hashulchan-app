/* ── The three areas of the product ───────────────────────────────────────────
 *
 * The app used to be one flat rail of fourteen tools. Fourteen equally-weighted
 * items is not an information architecture — it is a list of everything the
 * code can do, handed to someone who has never planned an event before and does
 * not know which of them is due today and which is due at the door.
 *
 * There are really three KINDS of work in planning an event, and they happen at
 * different times:
 *
 *   1. הרשימה וההושבה — who is coming and where they sit. Starts now, churns for
 *      weeks, closes the week before. This is the product's core promise.
 *   2. ההכנות        — everything that has to be arranged and paid for between
 *      now and the date: budget, tasks, vendors, invitations, the event site.
 *   3. יום האירוע     — what is actually used on the day itself, at the door.
 *
 * The nav expresses those three; the item rail only ever shows ONE area's
 * screens, so nobody sees fourteen things at once again.
 *
 * ── Build order: GUESTS BEFORE TABLES ────────────────────────────────────────
 * The numbered spine used to run details → tables → guests. That is backwards:
 * the guest list is the long pole (it churns for weeks) and the venue sizes the
 * tables FROM the headcount. Laying tables before the list is known is work
 * that gets thrown away. The default order is now
 *   פרטי האירוע → אורחים → שולחנות → אילוצים → הושבה
 * It is a DEFAULT, not a gate — some venues fix the table count in the
 * contract, so nothing stops a host going to שולחנות first.
 *
 * `num` is written out rather than derived from the array index so that a
 * reorder is a deliberate edit in one place and the numbers on the screens
 * (`שלב N מתוך 5`) always have one source to agree with.
 * ──────────────────────────────────────────────────────────────────────────── */

export const BUILD_STEP_COUNT = 5;

export const AREAS = [
  {
    id: "list",
    label: "הרשימה וההושבה",
    short: "רשימה והושבה",
    sub: "מי מגיע, ואיפה כל אחד יושב",
    when: "מהיום ועד שבוע לפני",
    mark: "seating",
    items: [
      { id: "setup",       label: "פרטי האירוע",  short: "האירוע",  num: 1, hint: "שמות, תאריך ואולם" },
      { id: "guests",      label: "אורחים",       num: 2, hint: "הרשימה — ידנית, מאקסל או משותפת" },
      { id: "tables",      label: "שולחנות",      num: 3, hint: "כמה שולחנות יש באולם ומה הקיבולת" },
      { id: "constraints", label: "אילוצים",      num: 4, hint: "מי חייב לשבת יחד ומי בשום אופן לא" },
      { id: "seating",     label: "הושבה",        num: 5, hint: "לחיצה אחת — והשולחנות מסתדרים" },
      { id: "rsvps",  label: "אישורי הגעה",  short: "אישורים", mark: "rsvp",   hint: "מי אישר, מי סירב, מי עוד לא ענה" },
      { id: "collab", label: "טבלה שיתופית", mark: "collab", hint: "המשפחה מוסיפה אורחים בעצמה" },
    ],
  },
  {
    id: "prep",
    label: "ההכנות",
    sub: "כל מה שצריך לסגור עד האירוע",
    when: "לאורך החודשים שלפני",
    mark: "events",
    items: [
      { id: "tasks",    label: "משימות",      mark: "tasks",         hint: "מה נשאר לעשות ועד מתי" },
      { id: "costs",    label: "תקציב",       mark: "budget",        hint: "כמה תכננתם, כמה כבר שילמתם" },
      { id: "vendors",  label: "ספקים",       mark: "vendors",       hint: "אולם, צלם, די-ג׳יי — ומה סוכם" },
      { id: "announce", label: "הזמנות",      mark: "announcements", hint: "שמרו את התאריך והזמנה דיגיטלית" },
      { id: "site",     label: "אתר האירוע",  mark: "site",          hint: "עמוד לאורחים עם כל הפרטים" },
      { id: "messages", label: "הודעות",      mark: "messages",      hint: "וואטסאפ לאורחים — תזכורות ועדכונים" },
    ],
  },
  {
    id: "day",
    label: "יום האירוע",
    sub: "הכניסה, קבלת הפנים והשולחנות ביום עצמו",
    when: "ביום האירוע",
    mark: "hostess",
    items: [
      // One screen for the door — it replaced the old check-in screen, the
      // hostess link and the "מסך כניסה" button. `/checkin` still resolves to
      // it for anything already printed on an invitation.
      // `standalone`: this route lives OUTSIDE the Shell (dark, full-screen, one
      // hand, a queue at the door), so opening it deliberately leaves the nav.
      { id: "entrance", label: "עמדת הכניסה", short: "הכניסה", mark: "checkin", standalone: true, hint: "מי הגיע, ולאיזה שולחן לשלוח" },
      { id: "nametags", label: "כרטיסי שם",        mark: "nameTags",  hint: "להדפסה מראש — שם ומספר שולחן" },
    ],
  },
];

/** The five numbered steps, in build order. */
export const BUILD_STEPS = AREAS
  .flatMap(a => a.items)
  .filter(it => it.num)
  .sort((a, b) => a.num - b.num);

/** The area a screen id belongs to, or null (dashboard, hub, unknown route). */
export function areaOfScreen(screen) {
  return AREAS.find(a => a.items.some(it => it.id === screen)) || null;
}

/**
 * The chain shown under a step heading: "אורחים ← שולחנות ← אילוצים ← הושבה".
 * In RTL the forward arrow is ←.
 */
export function stepChainAfter(id) {
  const i = BUILD_STEPS.findIndex(s => s.id === id);
  if (i === -1) return "";
  return BUILD_STEPS.slice(i + 1).map(s => s.label).join(" ← ");
}

/**
 * The numbered step a screen id IS, or null if it is not one of the five.
 *
 * Screens used to spell their own position into a string — "שלב 2 מתוך 5 —
 * שולחנות". When the order changed so that guests come before tables, two
 * screens kept announcing the old numbers and pointing at the old next step,
 * because a literal cannot be re-ordered. Read it from here instead.
 */
export function buildStep(id) {
  return BUILD_STEPS.find(s => s.id === id) || null;
}

/** The step that follows `id` in the default order, or null at the end. */
export function nextBuildStep(id) {
  const i = BUILD_STEPS.findIndex(s => s.id === id);
  return i === -1 || i === BUILD_STEPS.length - 1 ? null : BUILD_STEPS[i + 1];
}
