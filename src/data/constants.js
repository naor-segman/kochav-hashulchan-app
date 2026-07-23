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
