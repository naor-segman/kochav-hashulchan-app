/* The print sizes of NameTagsScreen, in one place.
 *
 * perPage is print geometry, not a guess — the columns and fixed row heights
 * in the @media print block of NameTagsScreen.module.css (סב35c). It used to
 * say 8 / 12 / 16 while content-height rows printed 16 / 24 / 32, and the
 * count read "22 pages" for a job that printed on 9.
 *
 * It lives here rather than inside NameTagsScreen.jsx because the event-day
 * service page quotes the same numbers. When the sticker sheet went from 16
 * to 32 the page kept saying "שש-עשרה מדבקות" (audit 3.10, C8) — a second
 * copy of a number drifts. The page now reads it from here, and the marketing
 * page does not pull the whole screen into its chunk to do so.
 */
export const NAME_TAG_SIZES = [
  { key: "table", label: "כרטיס שולחן",  perPage: 2,  note: "עומד על השולחן — המספר נקרא מרחוק" },
  { key: "card",  label: "כרטיס מקום",   perPage: 8,  note: "מונח על הצלחת — אחד לכל אורח" },
  { key: "tag",   label: "תג שם",        perPage: 12, note: "לענידה — נפוץ באירועים עסקיים" },
  { key: "small", label: "מדבקה קטנה",   perPage: 32, note: "מדבקות / כרטיסיות קטנות" },
];

/** perPage by key: { table: 2, card: 8, tag: 12, small: 32 }. */
export const PER_PAGE = Object.fromEntries(NAME_TAG_SIZES.map(s => [s.key, s.perPage]));
