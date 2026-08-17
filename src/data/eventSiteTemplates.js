// Event-site templates — one per event type. Each gives a visual theme and a
// sensible starter schedule/copy so the host's site is "auto-built" from the
// moment they open the editor. Hosts then tweak.

import { uid } from "../utils/uid.js";

// Visual themes (color + display treatment) available to the public event site.
// Kept independent of the app's magenta system — these are celebratory event
// looks, and the host picks what their guests see. That decision stands; the
// pass below is legibility, not identity.
//
// ── Contrast (30.7) ────────────────────────────────────────────────────────
// Seven of the ten themes failed AA on the guest-facing page. Measured, not
// judged: `accent` carries body-weight text (the timeline times, the countdown
// figures, the wish names, the FAQ chevrons) AND is the fill under `onAccent`
// on the "אישור הגעה" button; `muted` carries the story, the FAQ answers and
// every caption. Both were measured against every ground they are actually
// composited on — `bg`, `surface`, and `accentSoft`, which is a GROUND (the
// countdown tile) and not just a tint.
//
//   before → after, accent/bg · onAccent/accent · muted/bg
//     sky        3.74/3.97/4.41 → 4.91/5.21/4.88
//     olive      2.83/3.06/4.15 → 4.80/5.19/4.80
//     rose       3.42/3.66/4.30 → 5.01/5.36/4.99
//     sand       2.37/2.53/3.94 → 5.04/5.39/5.02
//     emerald    3.90/4.19/4.39 → 4.86/5.22/4.86
//     terracotta 3.82/4.13/4.34 → 5.10/5.51/5.11
//     blush      2.78/2.96/3.99 → 4.99/5.31/5.02
//     plum       4.58/4.94/4.58 → 5.06/5.46/5.02   (failed only on accentSoft, 4.10)
//     midnight   passed the three above, failed accent/accentSoft at 3.95 → 4.52
//     night      passed everywhere; untouched.
//
// Each value was moved along OKLCH LIGHTNESS ONLY — hue and chroma held to the
// authored value — and only as far as the binary search needed to clear 4.50.
// That is why the themes still read as תכלת, זית, טרקוטה and so on: the colour
// is the same colour, at the lightness it needed to be legible. The two dark
// themes move the other way (lighter), because on them that is the direction
// of more contrast.
export const SITE_THEMES = {
  sky: {
    key: "sky", label: "תכלת שמיים",
    bg: "#F4F9FB", surface: "#FFFFFF", ink: "#173747", muted: "#57717C",
    accent: "#1272AC", accentSoft: "#E5F1FA", line: "#DCE7EF", onAccent: "#FFFFFF",
  },
  olive: {
    key: "olive", label: "זית וחול",
    bg: "#F7F6F1", surface: "#FFFFFF", ink: "#3A3A2E", muted: "#706D60",
    accent: "#647335", accentSoft: "#EEF0E4", line: "#E4E2D6", onAccent: "#FFFFFF",
  },
  rose: {
    key: "rose", label: "ורד רך",
    bg: "#FBF6F7", surface: "#FFFFFF", ink: "#3E2A30", muted: "#7F646A",
    accent: "#A64F63", accentSoft: "#F7E8EC", line: "#EEDCE1", onAccent: "#FFFFFF",
  },
  night: {
    key: "night", label: "לילה וזהב",
    bg: "#14171F", surface: "#1D2230", ink: "#EDE7D9", muted: "#9A93A8",
    accent: "#D9B24C", accentSoft: "#2A2A33", line: "#2E3242", onAccent: "#14171F",
  },
  sand: {
    key: "sand", label: "חול חם",
    bg: "#FAF7F2", surface: "#FFFFFF", ink: "#3B342B", muted: "#74695A",
    accent: "#8D621D", accentSoft: "#F3EADB", line: "#E7DECE", onAccent: "#FFFFFF",
  },
  emerald: {
    key: "emerald", label: "אמרלד",
    bg: "#F3F8F5", surface: "#FFFFFF", ink: "#1E3A2E", muted: "#557365",
    accent: "#187B5B", accentSoft: "#E2F2EA", line: "#D8E8DF", onAccent: "#FFFFFF",
  },
  plum: {
    key: "plum", label: "שזיף",
    bg: "#F9F5FA", surface: "#FFFFFF", ink: "#3A2A40", muted: "#75647D",
    accent: "#84579F", accentSoft: "#F0E7F4", line: "#E7DCEC", onAccent: "#FFFFFF",
  },
  terracotta: {
    key: "terracotta", label: "טרקוטה",
    bg: "#FBF5F1", surface: "#FFFFFF", ink: "#3F2A21", muted: "#7E6355",
    accent: "#AD4B27", accentSoft: "#F6E5DC", line: "#EDDBD0", onAccent: "#FFFFFF",
  },
  midnight: {
    key: "midnight", label: "כחול חצות",
    bg: "#0F1826", surface: "#1A2536", ink: "#E6EDF6", muted: "#8FA3BD",
    accent: "#659AE1", accentSoft: "#22314A", line: "#2A3A54", onAccent: "#0F1826",
  },
  blush: {
    key: "blush", label: "פודרה",
    bg: "#FBF7F5", surface: "#FFFFFF", ink: "#3D3033", muted: "#7A6669",
    accent: "#8B6064", accentSoft: "#F5EAEB", line: "#EEE0E1", onAccent: "#FFFFFF",
  },
};

export const SITE_THEME_LIST = Object.values(SITE_THEMES);

// Heading font for the event site. All three families are already self-hosted
// for the app itself, so choosing one costs no extra network request — the
// picker is purely a stylistic choice, not a new dependency.
export const SITE_FONTS = [
  { key: "serif",   label: "קלאסי",  sample: "אבגד", stack: 'var(--font-family-serif)' },
  { key: "display", label: "מודרני", sample: "אבגד", stack: 'var(--font-family-display)' },
  { key: "base",    label: "נקי",    sample: "אבגד", stack: 'var(--font-family-base)' },
];
export const DEFAULT_SITE_FONT = "serif";
export const getSiteFont = key =>
  SITE_FONTS.find(f => f.key === key) || SITE_FONTS.find(f => f.key === DEFAULT_SITE_FONT);


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
    // No ids here. These literals are evaluated ONCE at module load, so every
    // event created from a template shared the same faq/schedule ids — and the
    // uid() call ran during import, taking the whole app down on a non-secure
    // origin. defaultEventSite mints fresh ids per event instead.
    faq: extra.faq || [
      { q: "איך מגיעים לאירוע? יש חניה?", a: "" },
      { q: "מתי צריך לאשר הגעה?", a: "מומלץ לאשר בהקדם, כדי שנוכל לתכנן את ההושבה." },
      { q: "איך אפשר לשלוח מתנה?", a: "דרך כפתור \"מתנה\" באתר — בהעברה מאובטחת." },
    ],
    ...extra,
  };
}

const WEDDING_SCHEDULE = () => [
  { time: "18:00", title: "קבלת פנים", icon: "🥂" },
  { time: "19:00", title: "חופה", icon: "💍" },
  { time: "20:00", title: "ארוחת ערב", icon: "🍽️" },
  { time: "21:00", title: "ריקודים", icon: "💃" },
];

export const EVENT_TYPE_TEMPLATES = {
  "חתונה":        base("rose",  "OUR WEDDING DAY", { schedule: WEDDING_SCHEDULE() }),
  "אירוס":        base("rose",  "WE'RE ENGAGED"),
  "חינה":         base("sand",  "HENNA NIGHT"),
  "בר מצווה":     base("sky",   "BAR MITZVAH"),
  "בת מצווה":     base("rose",  "BAT MITZVAH"),
  "ברית":         base("sky",   "BRIT MILAH"),
  "בריתה":        base("rose",  "BABY NAMING"),
  "יום הולדת":    base("sky",   "BIRTHDAY"),
  "אירוע משפחתי": base("olive", "FAMILY EVENT"),
  "אירוע עסקי":   base("night", "OUR EVENT"),
  "אחר":          base("sky",   "OUR EVENT"),
};

export function getEventTypeTemplate(type) {
  // Object.hasOwn, not a truthiness check: a stored type of "constructor" or
  // "toString" resolved through Object.prototype and returned a FUNCTION, which
  // then threw inside normalizeEvent — the single migration gateway — so no
  // event would load at all.
  return Object.hasOwn(EVENT_TYPE_TEMPLATES, type)
    ? EVENT_TYPE_TEMPLATES[type]
    : EVENT_TYPE_TEMPLATES["אחר"];
}

// Build a fresh default eventSite object for a given event type.
export function defaultEventSite(type) {
  const t = getEventTypeTemplate(type);
  return {
    enabled: false,           // host publishes when ready
    themeKey: t.themeKey,
    // The font picker and the custom domain were added after this template was
    // written, and only to normalizeEventSite — so a brand-new site came back
    // missing both keys until something normalized it a second time. Every key
    // the normalizer knows about belongs here too.
    fontKey: DEFAULT_SITE_FONT,
    customDomain: "",
    heroEn: t.heroEn,
    // A Storage URL since the photos moved out of the payload; still a data URL
    // on events created in guest mode, which have no cloud row to upload
    // against. Both are strings that render in <img src>.
    coverPhoto: null,
    story: "",
    gallery: [],
    countdown: true,          // show a live countdown to the event date
    dressCode: "",            // dress-code note shown to guests
    schedule: t.schedule.map(s => ({ ...s, id: uid() })),
    address: "",
    wazeUrl: "",
    parkingNote: "",
    shuttles: [],
    faq: t.faq.map(f => ({ ...f, id: uid() })),
    contactPhone: "",
    rsvpMessage: "",    // personal note from the hosts, shown after RSVP
    sections: { countdown: true, gallery: true, schedule: true, location: true, shuttles: false, dressCode: false, gift: true, blessings: true, faq: true },
    // Photo retention. Added to normalizeEventSite first and forgotten here —
    // the exact mistake the comment above this block was written about, caught
    // by the idempotence test rather than by reading the warning.
    photosKeepUntil: null,
    photosPurgedAt: null,
  };
}
