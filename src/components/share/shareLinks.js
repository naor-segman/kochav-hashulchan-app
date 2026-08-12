/* ── Every public link an event has ───────────────────────────────────────────
 *
 * This list used to be six rows at the bottom of EventSetupScreen, a form about
 * the HOST's own details — names, date, venue. The links are the opposite: they
 * are the only part of the product a guest ever sees. Two of the eight
 * (Save the Date and the designed invitation) were not on that list at all;
 * they were reachable only from inside the announcements editor, so a host
 * looking for "the thing I send people" had to know which of two screens to
 * open.
 *
 * `say` is deliberately not a description of the feature. "הזמנה דיגיטלית"
 * tells the host what we called it; "האורח פותח את ההזמנה ומאשר הגעה" tells
 * them which of eight links to paste into which WhatsApp message, which is the
 * only question anybody actually has on this screen.
 *
 * `tokenKey` is a key of ev.tokens (see TOKEN_KEYS in eventHelpers.js). Four of
 * these ride the SAME `invite` token — the announcements deliberately reuse it,
 * so adding them needed no migration and no new public RPC.
 * ──────────────────────────────────────────────────────────────────────────── */

export const SHARE_GROUPS = [
  {
    id: "guests",
    title: "מה ששולחים לאורחים",
    sub: "כל אחד מהם נפתח אצל האורח בטלפון. אין מה להוריד ואין סיסמה.",
    links: [
      {
        key: "saveTheDate",
        tokenKey: "invite",
        path: "/save-the-date/",
        label: "שמרו את התאריך",
        mark: "announcements",
        say: "האורח מסמן אצלו את התאריך — עוד לפני שההזמנה מוכנה.",
      },
      {
        key: "invitation",
        tokenKey: "invite",
        path: "/invitation/",
        label: "הזמנה דיגיטלית",
        mark: "invite",
        say: "האורח פותח את ההזמנה עצמה. זה הקישור שנשלח בקבוצת הוואטסאפ.",
      },
      {
        key: "card",
        tokenKey: "invite",
        path: "/card/",
        label: "כרטיס הזמנה עם קוד",
        mark: "nameTags",
        say: "האורח מקבל כרטיס מעוצב, ומהקוד שעליו הוא עובר ישר לאישור ההגעה.",
      },
      {
        key: "site",
        tokenKey: "invite",
        path: "/invite/",
        label: "אתר האירוע",
        mark: "site",
        say: "האורח בודק שעה, כתובת, ניווט, לוח זמנים ותשובות לשאלות שחוזרות.",
      },
      {
        key: "rsvp",
        tokenKey: "rsvp",
        path: "/rsvp/",
        label: "אישור הגעה",
        mark: "rsvp",
        say: "האורח אומר אם הוא מגיע וכמה אנשים איתו — והתשובה נוחתת ברשימה.",
      },
      {
        key: "gift",
        tokenKey: "gift",
        path: "/gift/",
        label: "מתנה וברכה",
        mark: "gifts",
        say: "האורח משאיר לכם ברכה, ורואה איך להעביר מתנה.",
      },
    ],
  },
  {
    id: "helpers",
    title: "למי שעוזר לכם",
    sub: "לא לרשימת התפוצה — רק לאנשים שאתם סומכים עליהם.",
    links: [
      {
        key: "collab",
        tokenKey: "collab",
        path: "/collab/",
        label: "טבלה שיתופית",
        mark: "collab",
        // Honest by design: the shared table is a FULL grant. The comment on
        // rotateEventToken() in eventHelpers.js spells out what the holder can
        // do — read every phone number, edit, delete and export. A line here
        // that implied otherwise would be the product lying about its own
        // permissions.
        say: "מי שקיבל מוסיף אורחים בעצמו — ורואה את כל הרשימה, אז שלחו רק למי שצריך.",
      },
    ],
  },
  {
    id: "day",
    title: "ביום האירוע",
    sub: "לפתוח בטלפון של מי שעומד בדלת.",
    links: [
      {
        key: "entrance",
        tokenKey: "hostess",
        path: "/entrance/",
        label: "עמדת הכניסה",
        mark: "checkin",
        say: "מי שבדלת מחפש שם, מסמן שהגיע, ורואה לאיזה שולחן לשלוח.",
      },
    ],
  },
];

/** Flat list, for anything that wants the links without the grouping. */
export const SHARE_LINKS = SHARE_GROUPS.flatMap(g => g.links);
