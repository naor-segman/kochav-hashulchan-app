// Starter checklists per event type.
//
// `offset` is days BEFORE the event, used to seed a due date from the event
// date — the host gets a schedule, not just a list. Nothing here is mandatory:
// the list is offered once, on an empty board, and every row is editable.
//
// Kept deliberately short. A 60-item checklist is a wall, not a plan; these are
// the items an Israeli host actually forgets.

export const TASK_PRIORITIES = [
  { value: "high",   label: "גבוהה" },
  { value: "normal", label: "רגילה" },
  { value: "low",    label: "נמוכה" },
];

export const TASK_STATUSES = [
  { value: "todo",  label: "לביצוע" },
  { value: "doing", label: "בתהליך" },
  { value: "done",  label: "הושלם" },
];

const WEDDING = [
  { title: "לסגור אולם ותאריך",             offset: 180, priority: "high"   },
  { title: "לחתום עם צלם",                  offset: 150, priority: "high"   },
  { title: "לסגור DJ / להקה",               offset: 150, priority: "high"   },
  { title: "לבחור שמלה וחליפה",             offset: 120, priority: "normal" },
  { title: "לסגור רב / עורך טקס",           offset: 120, priority: "high"   },
  { title: "לבנות את רשימת המוזמנים",       offset:  90, priority: "high"   },
  { title: "לעצב ולשלוח הזמנה דיגיטלית",    offset:  60, priority: "high"   },
  { title: "לסגור עיצוב ופרחים",            offset:  60, priority: "normal" },
  { title: "לפתוח אישורי הגעה",             offset:  45, priority: "high"   },
  { title: "לסגור הסעות",                   offset:  30, priority: "normal" },
  { title: "טעימות באולם",                  offset:  30, priority: "normal" },
  { title: "לסגור מספר מנות מול האולם",     offset:  10, priority: "high"   },
  { title: "לסיים סידורי הושבה",            offset:   7, priority: "high"   },
  { title: "להדפיס שילוט ורשימת כניסה",     offset:   3, priority: "normal" },
  { title: "לתדרך את הדיילת/צוות הכניסה",   offset:   2, priority: "normal" },
];

const MITZVAH = [
  { title: "לסגור אולם ותאריך",           offset: 150, priority: "high"   },
  { title: "לתאם עם בית הכנסת",           offset: 120, priority: "high"   },
  { title: "לסגור צלם",                   offset:  90, priority: "high"   },
  { title: "לסגור DJ / הגברה",            offset:  90, priority: "normal" },
  { title: "לבנות את רשימת המוזמנים",     offset:  75, priority: "high"   },
  { title: "לשלוח הזמנות",                offset:  45, priority: "high"   },
  { title: "לפתוח אישורי הגעה",           offset:  35, priority: "high"   },
  { title: "לסגור מספר מנות",             offset:  10, priority: "high"   },
  { title: "לסיים סידורי הושבה",          offset:   7, priority: "high"   },
];

const BUSINESS = [
  { title: "לאשר תקציב",                  offset:  90, priority: "high"   },
  { title: "לסגור מקום ותאריך",           offset:  75, priority: "high"   },
  { title: "לבנות רשימת מוזמנים",         offset:  45, priority: "high"   },
  { title: "לשלוח הזמנות",                offset:  30, priority: "high"   },
  { title: "לתאם ספקים (הגברה/קייטרינג)", offset:  30, priority: "normal" },
  { title: "לאסוף אישורי הגעה",           offset:  14, priority: "high"   },
  { title: "לסגור סידורי הושבה",          offset:   7, priority: "normal" },
];

// Keyed by the Hebrew strings normalizeEvent actually stores (constants.js
// EVENT_TYPES). English keys silently fell through to WEDDING, so a bar
// mitzvah board opened with "לבחור שמלה וחליפה".
// Birthday / family / "other" had no list at all and silently got the wedding
// one. These are the items those events genuinely share.
const SOCIAL = [
  { title: "לסגור מקום ותאריך",        offset: 90, priority: "high"   },
  { title: "לבנות את רשימת המוזמנים",  offset: 60, priority: "high"   },
  { title: "לסגור קייטרינג / אוכל",    offset: 45, priority: "normal" },
  { title: "לשלוח הזמנות",             offset: 30, priority: "high"   },
  { title: "לפתוח אישורי הגעה",        offset: 21, priority: "high"   },
  { title: "לסגור מוזיקה / הגברה",     offset: 21, priority: "normal" },
  { title: "לסגור מספר מנות",          offset: 10, priority: "high"   },
  { title: "לסיים סידורי הושבה",       offset:  5, priority: "normal" },
];

// A brit is the one event here that is not planned for months. The date is set
// by the birth, it happens on the eighth day, and the parents are organising it
// on almost no sleep. Every other list would have opened with "לסגור מקום
// ותאריך, 90 יום לפני" for an event eight days away — which is exactly why
// "אחר" was not an acceptable answer for it.
const BRIT = [
  { title: "לתאם מוהל",                          offset: 6, priority: "high"   },
  { title: "לסגור מקום — בית / בית כנסת / אולם", offset: 5, priority: "high"   },
  { title: "להודיע למשפחה ולחברים",              offset: 5, priority: "high"   },
  { title: "להזמין כיבוד / קייטרינג",            offset: 3, priority: "high"   },
  { title: "לוודא סנדק וכיבודים",                offset: 3, priority: "normal" },
  { title: "לאסוף אישורי הגעה",                  offset: 2, priority: "normal" },
  { title: "לסדר ישיבה למבוגרים ולהורים",        offset: 1, priority: "normal" },
];

const BY_TYPE = {
  "חתונה":         WEDDING,
  "חינה":          WEDDING,
  "אירוס":         WEDDING,
  "בר מצווה":      MITZVAH,
  "בת מצווה":      MITZVAH,
  "ברית":          BRIT,
  "בריתה":         BRIT,
  "אירוע עסקי":    BUSINESS,
  "יום הולדת":     SOCIAL,
  "אירוע משפחתי":  SOCIAL,
  "אחר":           SOCIAL,
};

/** Seed rows for an event type — plain data, no ids or dates yet. */
export function starterTasks(type) {
  // Unknown types get the generic social list, same as "אחר". Falling back to
  // WEDDING meant any type we hadn't mapped opened with a dress fitting.
  return Object.hasOwn(BY_TYPE, type) ? BY_TYPE[type] : SOCIAL;
}

/**
 * Turn a starter row into a task, dating it from the event.
 * Events already in the past (or with no date) simply get no due date rather
 * than a pile of overdue rows on day one.
 */
export function seedTaskDue(eventDate, offsetDays) {
  if (!eventDate) return "";
  const ev = new Date(eventDate + "T00:00:00");
  if (Number.isNaN(ev.getTime())) return "";
  const days = Number(offsetDays);
  if (!Number.isFinite(days)) return "";
  // Calendar arithmetic, not fixed milliseconds. Subtracting days * 86400000
  // crosses an Israeli DST transition an hour short, so 6 of the 15 wedding
  // tasks were seeded a day early for a summer event.
  const due = new Date(ev.getFullYear(), ev.getMonth(), ev.getDate() - days);
  if (Number.isNaN(due.getTime())) return "";
  if (due.getTime() < Date.now() - 86400000) return "";
  // toISOString() re-reads a local-midnight Date in UTC, which lands on the
  // PREVIOUS day everywhere east of Greenwich — i.e. every date in Israel was
  // seeded one day early. Format from the local parts instead.
  return localISODate(due);
}

/** YYYY-MM-DD from a Date's LOCAL parts, never shifted through UTC. */
export function localISODate(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
