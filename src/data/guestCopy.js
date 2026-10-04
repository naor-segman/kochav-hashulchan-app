/**
 * What every guest page says when it has no event to show. Plain data, in a
 * module of its own: publicTokens.js re-exports both, but the tab-title hook
 * reads them from here, so a test that replaces publicTokens.js wholesale
 * (several do) does not take the page's title down with it.
 */

/**
 * The link resolves to nothing. One copy.
 *
 * There were eight: "הלינק לא תקין או שפג תוקפו", "הקישור אינו תקין או שפג
 * תוקפו", "ההזמנה לא נמצאה", "האלבום לא נמצא", "הדף לא נמצא", "הקישור לקיר
 * הברכות אינו תקין.", "הקישור אינו תקין או שהאירוע הוסר", "הקישור אינו פעיל"
 * — across ten guest pages, two of them in slang ("לינק") (audit 3.10, P2-7).
 * A guest who opens two links from the same host should not meet two products.
 *
 * "אינו פעיל", not "אינו תקין": the token RPCs return nothing both for a
 * mistyped link AND for one the host has switched off or replaced, and from
 * the page the two cannot be told apart — the shared table worked this out
 * first, and its sentence is the one kept. Plural address, like the rest.
 */
export const INVALID_LINK_TEXT = {
  title: "הקישור אינו פעיל",
  body:  "ייתכן שהכתובת שגויה, או שבעלי האירוע סגרו את הקישור או החליפו אותו. בקשו מהם קישור מעודכן.",
};

/** The server cannot be reached. One copy. */
export const UNREACHABLE_TEXT = {
  title: "אין חיבור כרגע",
  body:  "לא הצלחנו להגיע לשרת — הקישור עצמו בסדר. נסו לרענן את הדף בעוד רגע.",
};
