import { SITE_THEMES } from "./eventSiteTemplates.js";

/**
 * Save-the-Date and the designed invitation.
 *
 * Both are the same object with a different `kind`, because they are the same
 * page at two moments: "keep the date" months out, "here are the details" a
 * few weeks out. Building one component for both keeps them visually part of
 * the same event instead of drifting into two unrelated designs — and it means
 * a theme change lands on both.
 *
 * They ride on the existing INVITE token rather than minting new ones, so no
 * migration and no new public RPC: `/save-the-date/:token` and
 * `/invitation/:token` both resolve through the same lookup the QR card uses.
 */

export const ANNOUNCEMENT_KINDS = [
  { key: "saveTheDate", label: "Save the Date",      route: "save-the-date", icon: "📅" },
  { key: "invitation",  label: "הזמנה דיגיטלית",     route: "invitation",    icon: "💌" },
];

export const announcementRoute = kind =>
  ANNOUNCEMENT_KINDS.find(k => k.key === kind)?.route || "invitation";

/** Layout presets — how the headline sits over the photo. */
export const ANNOUNCEMENT_LAYOUTS = [
  { key: "center",  label: "ממורכז" },
  { key: "bottom",  label: "תחתון" },
  { key: "card",    label: "כרטיס" },
];

const HE = {
  wedding:  { a: "מתחתנים!",      b: "שמרו את התאריך" },
  bar:      { a: "בר מצווה",      b: "שמרו את התאריך" },
  bat:      { a: "בת מצווה",      b: "שמרו את התאריך" },
  brit:     { a: "ברית",          b: "שמרו את התאריך" },
  henna:    { a: "חינה",          b: "שמרו את התאריך" },
  business: { a: "אירוע חברה",    b: "שמרו את התאריך" },
};

const INVITE_HE = {
  wedding:  "אתם מוזמנים לחתונה שלנו",
  bar:      "אתם מוזמנים לחגוג איתנו",
  bat:      "אתם מוזמנים לחגוג איתנו",
  brit:     "אתם מוזמנים לברית",
  henna:    "אתם מוזמנים לחינה",
  business: "אתם מוזמנים לאירוע",
};

/** Blank-slate content for one announcement kind. */
export function defaultAnnouncement(kind, type) {
  const t = HE[type] || HE.wedding;
  const isSave = kind === "saveTheDate";
  return {
    enabled:     false,
    themeKey:    "sky",
    fontKey:     "serif",
    layout:      isSave ? "center" : "card",
    photo:       null,
    // Kept short on purpose: these pages are read in two seconds on a phone.
    headline:    isSave ? t.b : (INVITE_HE[type] || INVITE_HE.wedding),
    subheadline: isSave ? t.a : "",
    message:     "",
    showCountdown: isSave,
    // A Save-the-Date months out should not ask for an RSVP that isn't open;
    // the invitation is exactly the moment to ask.
    showRsvp:      !isSave,
    showSite:      true,
    showLocation:  !isSave,
  };
}

export function defaultAnnouncements(type) {
  return {
    saveTheDate: defaultAnnouncement("saveTheDate", type),
    invitation:  defaultAnnouncement("invitation", type),
  };
}

/** Fill gaps on a stored announcement without overwriting real values. */
export function normalizeAnnouncement(a, kind, type) {
  const def = defaultAnnouncement(kind, type);
  if (!a || typeof a !== "object") return def;
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  return {
    enabled:       bool(a.enabled, def.enabled),
    themeKey:      SITE_THEMES[a.themeKey] ? a.themeKey : def.themeKey,
    fontKey:       a.fontKey ?? def.fontKey,
    layout:        ANNOUNCEMENT_LAYOUTS.some(l => l.key === a.layout) ? a.layout : def.layout,
    photo:         a.photo ?? null,
    headline:      a.headline    ?? def.headline,
    subheadline:   a.subheadline ?? def.subheadline,
    message:       a.message     ?? def.message,
    showCountdown: bool(a.showCountdown, def.showCountdown),
    showRsvp:      bool(a.showRsvp,      def.showRsvp),
    showSite:      bool(a.showSite,      def.showSite),
    showLocation:  bool(a.showLocation,  def.showLocation),
  };
}

export function normalizeAnnouncements(anns, type) {
  const src = (anns && typeof anns === "object") ? anns : {};
  return {
    saveTheDate: normalizeAnnouncement(src.saveTheDate, "saveTheDate", type),
    invitation:  normalizeAnnouncement(src.invitation,  "invitation",  type),
  };
}
