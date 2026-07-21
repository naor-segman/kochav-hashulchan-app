// Event-site templates — one per event type. Each gives a visual theme and a
// sensible starter schedule/copy so the host's site is "auto-built" from the
// moment they open the editor. Hosts then tweak.

import { uid } from "../utils/uid.js";

// Visual themes (color + display treatment) available to the public event site.
// Kept independent of the app's teal system — these are celebratory event looks.
export const SITE_THEMES = {
  sky: {
    key: "sky", label: "תכלת שמיים",
    bg: "#F4F9FB", surface: "#FFFFFF", ink: "#173747", muted: "#5E7883",
    accent: "#2E86C1", accentSoft: "#E5F1FA", line: "#DCE7EF", onAccent: "#FFFFFF",
  },
  olive: {
    key: "olive", label: "זית וחול",
    bg: "#F7F6F1", surface: "#FFFFFF", ink: "#3A3A2E", muted: "#7A776A",
    accent: "#8A9A5B", accentSoft: "#EEF0E4", line: "#E4E2D6", onAccent: "#FFFFFF",
  },
  rose: {
    key: "rose", label: "ורד רך",
    bg: "#FBF6F7", surface: "#FFFFFF", ink: "#3E2A30", muted: "#8A6E75",
    accent: "#C56A7E", accentSoft: "#F7E8EC", line: "#EEDCE1", onAccent: "#FFFFFF",
  },
  night: {
    key: "night", label: "לילה וזהב",
    bg: "#14171F", surface: "#1D2230", ink: "#EDE7D9", muted: "#9A93A8",
    accent: "#D9B24C", accentSoft: "#2A2A33", line: "#2E3242", onAccent: "#14171F",
  },
  sand: {
    key: "sand", label: "חול חם",
    bg: "#FAF7F2", surface: "#FFFFFF", ink: "#3B342B", muted: "#857A6B",
    accent: "#C89B5A", accentSoft: "#F3EADB", line: "#E7DECE", onAccent: "#FFFFFF",
  },
};

export const SITE_THEME_LIST = Object.values(SITE_THEMES);

export function getSiteTheme(key) {
  return SITE_THEMES[key] || SITE_THEMES.sky;
}

// Per-event-type starter content. `themeKey` is a tasteful default; the host can
// switch. `hero` is a short English/Hebrew display line. `schedule` seeds the
// timeline. `faq` seeds common questions.
function base(themeKey, heroEn, extra = {}) {
  return {
    themeKey,
    heroEn,
    schedule: extra.schedule || [],
    faq: extra.faq || [
      { id: uid(), q: "איך מגיעים לאירוע? יש חניה?", a: "" },
      { id: uid(), q: "מתי צריך לאשר הגעה?", a: "מומלץ לאשר בהקדם, כדי שנוכל לתכנן את ההושבה." },
      { id: uid(), q: "איך אפשר לשלוח מתנה?", a: "דרך כפתור \"מתנה\" באתר — בהעברה מאובטחת." },
    ],
    ...extra,
  };
}

const WEDDING_SCHEDULE = () => [
  { id: uid(), time: "18:00", title: "קבלת פנים", icon: "🥂" },
  { id: uid(), time: "19:00", title: "חופה", icon: "💍" },
  { id: uid(), time: "20:00", title: "ארוחת ערב", icon: "🍽️" },
  { id: uid(), time: "21:00", title: "ריקודים", icon: "💃" },
];

export const EVENT_TYPE_TEMPLATES = {
  "חתונה":        base("rose",  "OUR WEDDING DAY", { schedule: WEDDING_SCHEDULE(), heroHe: "מתחתנים!" }),
  "אירוס":        base("rose",  "WE'RE ENGAGED",   { heroHe: "חוגגים אירוסין" }),
  "חינה":         base("sand",  "HENNA NIGHT",     { heroHe: "חוגגים חינה" }),
  "בר מצווה":     base("sky",   "BAR MITZVAH",     { heroHe: "חוגגים בר מצווה" }),
  "בת מצווה":     base("rose",  "BAT MITZVAH",     { heroHe: "חוגגים בת מצווה" }),
  "יום הולדת":    base("sky",   "BIRTHDAY",        { heroHe: "חוגגים יום הולדת" }),
  "אירוע משפחתי": base("olive", "FAMILY EVENT",    { heroHe: "אירוע משפחתי" }),
  "אירוע עסקי":   base("night", "OUR EVENT",       { heroHe: "אירוע עסקי" }),
  "אחר":          base("sky",   "OUR EVENT",       { heroHe: "האירוע שלנו" }),
};

export function getEventTypeTemplate(type) {
  return EVENT_TYPE_TEMPLATES[type] || EVENT_TYPE_TEMPLATES["אחר"];
}

// Build a fresh default eventSite object for a given event type.
export function defaultEventSite(type) {
  const t = getEventTypeTemplate(type);
  return {
    enabled: false,           // host publishes when ready
    themeKey: t.themeKey,
    heroEn: t.heroEn,
    coverPhoto: null,         // compressed data URL
    story: "",
    schedule: t.schedule.map(s => ({ ...s })),
    address: "",
    wazeUrl: "",
    parkingNote: "",
    faq: t.faq.map(f => ({ ...f })),
    contactPhone: "",
    sections: { schedule: true, location: true, gift: true, blessings: true, faq: true },
  };
}
