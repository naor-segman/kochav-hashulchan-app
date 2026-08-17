/* ── Every public link an event has ───────────────────────────────────────────
 *
 * This list used to be six rows at the bottom of EventSetupScreen, a form about
 * the HOST's own details — names, date, venue. The links are the opposite: they
 * are the only part of the product a guest ever sees. Two of them
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
      {
        // Orphaned until now: `album` was in TOKEN_KEYS, it had a route, it had
        // fetchAlbumPhotos/uploadAlbumPhoto and its own storage bucket, and
        // /album/:token rendered a working upload screen — but it appeared in
        // no share group and nowhere else in src/, so there was no way for a
        // host to reach the link. A finished feature with no door on it.
        key: "album",
        tokenKey: "album",
        path: "/album/",
        label: "אלבום משותף",
        mark: "album",
        say: "האורחים מעלים את התמונות שהם צילמו, והכל נאסף למקום אחד במקום להסתובב בין עשרים צ׳אטים.",
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
    sub: "אחד לטלפון של מי שעומד בדלת, אחד למסך באולם.",
    links: [
      {
        key: "entrance",
        tokenKey: "hostess",
        path: "/entrance/",
        label: "עמדת הכניסה",
        mark: "checkin",
        say: "מי שבדלת מחפש שם, מסמן שהגיע, ורואה לאיזה שולחן לשלוח.",
      },
      {
        // The same orphaning that hid the album, one screen over and never
        // fixed: /gift/:token/wall has a route, a screen, and its own RPC that
        // returns blessings without amounts — and it appeared in no share
        // group and nowhere else in src/, so its only mention outside the
        // screen itself was the route definition. A host who wanted to project
        // the blessing wall at the venue had no way to obtain the URL.
        //
        // It sits here rather than with the guest links because nobody sends
        // it to a guest: it is opened once, on the screen in the hall.
        key: "giftWall",
        tokenKey: "gift",
        path: "/gift/",
        // The only link whose address is not prefix+token. `suffix` exists for
        // this one row; the alternative was a second `path` convention that
        // every consumer would have to know about.
        suffix: "/wall",
        label: "קיר הברכות",
        mark: "gifts",
        say: "הברכות שהאורחים השאירו, מוקרנות על מסך באולם. בלי סכומים — רק מה שכתבו.",
      },
    ],
  },
];

/** Flat list, for anything that wants the links without the grouping. */
export const SHARE_LINKS = SHARE_GROUPS.flatMap(g => g.links);

/**
 * The address a host copies, for one link.
 *
 * This lives here rather than inline in ShareLinksScreen because a test that
 * re-implements the concatenation proves nothing about the screen. It was
 * inline, and the test asserted `path + token + suffix` on its own — so
 * deleting `+ (sl.suffix || "")` from the screen left all 1109 tests green
 * while sending every host to the gift FORM instead of the projection wall.
 * Measured, not argued: the mutation was applied and the suite passed.
 *
 * One function, used by the screen and by the test, is the only arrangement
 * where the assertion is about the thing that ships.
 *
 * @param {object} link   a row from SHARE_LINKS
 * @param {string} origin window.location.origin
 * @param {string} token  the event's token for link.tokenKey
 */
export function shareUrl(link, origin, token) {
  return origin + link.path + token + (link.suffix || "");
}
