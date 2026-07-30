// ── Activity log action type definitions ──────────────────────────────────────
//
// Used by AdminActivityScreen for display labels and icons.
// No logging is written to the DB from client code yet.
// Future: a Supabase Edge Function or trigger will insert rows here.

// icon values are names from the shared Icon component (line-icon set).
//
// There used to be a `color` on every entry, and the result was six saturated
// hues — blue, green, red, violet, cyan, magenta — painted down ONE column of
// one table, in a panel whose whole design contract is to be monochrome. The
// hue was not carrying information either: it was a second encoding of the
// label already sitting next to it. The icon is the scannable distinction and
// it costs no colour.
export const ACTION_META = {
  user_created:          { label: "משתמש נוצר",          icon: "users"     },
  event_created:         { label: "אירוע נוצר",          icon: "calendar"  },
  event_deleted:         { label: "אירוע נמחק",          icon: "trash"     },
  event_exported:        { label: "אירוע יוצא",          icon: "chart"     },
  template_created:      { label: "תבנית נוצרה",         icon: "clipboard" },
  subscription_changed:  { label: "מנוי שונה",           icon: "card"      },
  admin_login:           { label: "כניסת מנהל",          icon: "key"       },
};

export const ACTION_KEYS = Object.keys(ACTION_META);

/** Icon for an action the map does not know — so an unmapped row is not the
 *  one row on the page with a hole where every other row has a glyph. */
export const UNKNOWN_ACTION_ICON = "bolt";

export function getActionLabel(action) {
  return ACTION_META[action]?.label ?? action ?? "—";
}

/** False when the row's action has no Hebrew label — the screen then renders
 *  the raw key as a code token rather than as if it were a Hebrew label. */
export function isKnownAction(action) {
  return !!ACTION_META[action];
}

export const ENTITY_TYPE_LABELS = {
  user:         "משתמש",
  event:        "אירוע",
  template:     "תבנית",
  subscription: "מנוי",
  admin:        "מנהל",
  // Stripe writes these two and both rendered in English mid-table.
  invoice:      "חשבונית",
  payment:      "תשלום",
};

export function getEntityLabel(entityType) {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType ?? "—";
}

export function isKnownEntity(entityType) {
  return !!ENTITY_TYPE_LABELS[entityType];
}

// ── Metadata rendering ────────────────────────────────────────────────────────
//
// The metadata JSONB was serialised verbatim: `from: pro, to: enterprise,
// amount_cents: 24900` — English keys and a raw cents integer, in a Hebrew
// panel, truncated mid-word at 200px with nothing to recover the rest.

const META_KEY_LABELS = {
  from:         "מ",
  to:           "ל",
  plan:         "תוכנית",
  status:       "סטטוס",
  reason:       "סיבה",
  format:       "פורמט",
  tables:       "שולחנות",
  guests:       "אורחים",
  amount_cents: "סכום",
  amount:       "סכום",
  currency:     "מטבע",
  source:       "מקור",
  ip:           "כתובת IP",
};

const shekels = (cents) =>
  (Number(cents) / 100).toLocaleString("he-IL", {
    style: "currency", currency: "ILS", maximumFractionDigits: 2,
  });

function metaValue(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "amount_cents") return shekels(value);
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "object")  return JSON.stringify(value);
  // Values that are themselves plan/status keys get their Hebrew label.
  return String(value);
}

/**
 * A short Hebrew summary of the metadata JSONB, for the table cell.
 * Returns "—" when there is nothing to show.
 */
export function metaSummary(meta, valueLabel = (v) => String(v)) {
  if (!meta || typeof meta !== "object") return "—";
  const entries = Object.entries(meta).slice(0, 3);
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => {
      const label = META_KEY_LABELS[k] ?? k;
      const val   = k === "from" || k === "to" || k === "plan"
        ? valueLabel(v)
        : metaValue(k, v);
      return `${label}: ${val}`;
    })
    .join(" · ");
}

/** The full metadata, unabridged — goes in the cell's title so truncation is
 *  never the only copy of the value. */
export function metaFull(meta, valueLabel = (v) => String(v)) {
  if (!meta || typeof meta !== "object") return "";
  return Object.entries(meta)
    .map(([k, v]) => {
      const label = META_KEY_LABELS[k] ?? k;
      const val   = k === "from" || k === "to" || k === "plan"
        ? valueLabel(v)
        : metaValue(k, v);
      return `${label}: ${val}`;
    })
    .join("\n");
}
