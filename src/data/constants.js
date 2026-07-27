// V1 constants — copied verbatim from legacy/v1-seating-app.jsx

export const EVENT_TYPES = [
  "חתונה","בר מצווה","בת מצווה","חינה","אירוס",
  "אירוע משפחתי","אירוע עסקי","יום הולדת","אחר",
];

export const GROUP_OPTIONS = [
  "הורים","אחים ואחיות","סבים וסבתות","דודים ודודות",
  "בני דודים","חברים","חברים מהלימודים","חברים מהצבא",
  "חברים מהעבודה","משפחה קרובה","משפחה רחוקה","עמיתים","אחר",
];

// Default groups for corporate events, where the family-oriented set above
// makes no sense. "אחר" stays last and triggers custom-group creation.
export const BUSINESS_GROUP_OPTIONS = [
  "הנהלה","עובדים","צוות","לקוחות","ספקים","שותפים עסקיים","אורחי כבוד","אחר",
];

export const TABLE_TYPES = [
  { value:"regular", label:"רגיל" },
  { value:"knight",  label:"אביר" },
  { value:"vip",     label:"VIP" },
  { value:"bar",     label:"בר" },
  { value:"small",   label:"קטן" },
];

// Physical shape of a table. Separate from TABLE_TYPES, which is about the
// table's ROLE (VIP, bar…) — an אביר table is long, a regular one is usually
// round, and the venue needs both facts. Round is the Israeli default.
export const TABLE_SHAPES = [
  { value:"round",   label:"עגול",   glyph:"●" },
  { value:"square",  label:"ריבוע",  glyph:"■" },
  { value:"rect",    label:"מלבן",   glyph:"▬" },
  { value:"ellipse", label:"אליפסה", glyph:"⬭" },
];
export const DEFAULT_TABLE_SHAPE = "round";
export const tableShape = t => TABLE_SHAPES.find(s => s.value === t?.shape) ||
                               TABLE_SHAPES.find(s => s.value === DEFAULT_TABLE_SHAPE);

// Non-table fixtures placed on the venue sketch. They occupy space and matter
// for orientation ("who sits near the speakers?") but never hold guests, so
// they live outside the tables array entirely.
export const VENUE_ELEMENTS = [
  { value:"chuppah",    label:"חופה",          icon:"⛩" },
  { value:"stage",      label:"במה",           icon:"▭" },
  { value:"buffet",     label:"בופה",          icon:"🍽" },
  { value:"bar",        label:"בר",            icon:"🍸" },
  { value:"dancefloor", label:"רחבת ריקודים",  icon:"♪" },
  { value:"dj",         label:"עמדת DJ",       icon:"🎛" },
  { value:"entrance",   label:"כניסה",         icon:"⇥" },
  { value:"giftbox",    label:"קופסת מתנות",   icon:"🎁" },
];
export const venueElement = v => VENUE_ELEMENTS.find(e => e.value === v) || null;

export const STORAGE_KEY = "kochav_hashulchan_v1";

export const MEAL_OPTIONS = [
  { value: "regular",    label: "רגיל",          emoji: "🍽️" },
  { value: "kosher",     label: "כשר מהדרין",    emoji: "✡️" },
  { value: "vegan",      label: "טבעוני",         emoji: "🌱" },
  { value: "vegetarian", label: "צמחוני",         emoji: "🥗" },
  { value: "child",      label: "ילדים",          emoji: "🧒" },
  { value: "none",       label: "לא אוכל",        emoji: "❌" },
];

export const MEAL_DEFAULT = "regular";
