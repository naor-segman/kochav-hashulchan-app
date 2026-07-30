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

// Non-table fixtures placed on the venue sketch. They occupy space and matter
// for orientation ("who sits near the speakers?") but never hold guests, so
// they live outside the tables array entirely.
export const VENUE_ELEMENTS = [
  // `icon` is a key into components/ui/Icon.jsx, not a character. Eight
  // fixtures drawn in four different emoji styles sat on a photo of a real
  // hall and looked like stickers; the line set belongs to the product.
  { value:"chuppah",    label:"חופה",          icon:"chuppah" },
  { value:"stage",      label:"במה",           icon:"stage" },
  { value:"buffet",     label:"בופה",          icon:"food" },
  { value:"bar",        label:"בר",            icon:"glass" },
  { value:"dancefloor", label:"רחבת ריקודים",  icon:"note" },
  { value:"dj",         label:"עמדת DJ",       icon:"turntable" },
  { value:"entrance",   label:"כניסה",         icon:"doorway" },
  { value:"giftbox",    label:"קופסת מתנות",   icon:"gift" },
];
export const venueElement = v => VENUE_ELEMENTS.find(e => e.value === v) || null;

export const STORAGE_KEY = "kochav_hashulchan_v1";

/* No `emoji` field. It existed so a native <option> could carry a glyph, and
   that is a real constraint — an SVG cannot go inside one. But the same field
   was then reused in the guest row and in the stat pills, where a drawn icon
   fits perfectly, and six emoji from six drawing styles is exactly the tell
   the rest of the product spent a day removing. Inside the select the label
   carries it alone, which is what a native select is for. */
export const MEAL_OPTIONS = [
  { value: "regular",    label: "רגיל" },
  { value: "kosher",     label: "כשר מהדרין" },
  { value: "vegan",      label: "טבעוני" },
  { value: "vegetarian", label: "צמחוני" },
  { value: "child",      label: "ילדים" },
  { value: "none",       label: "לא אוכל" },
];

export const MEAL_DEFAULT = "regular";
