// ── Plan definitions ──────────────────────────────────────────────────────────
//
// Single source of truth for plan tiers, feature limits, and status labels.
// No payment logic here — this is purely definitional config for the admin UI
// and future customer-facing feature gating.
//
// DB status column values: active | trialing | cancelled | expired
// DB plan column values:   free  | pro       | enterprise

// ── Plan limit shapes ─────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free: {
    maxEvents:         1,
    maxGuests:         80,
    advancedExports:   false,
    aiFeatures:        false,
    collaboration:     false,
  },
  pro: {
    maxEvents:         20,
    maxGuests:         500,
    advancedExports:   true,
    aiFeatures:        false,
    collaboration:     false,
  },
  enterprise: {
    maxEvents:         Infinity,
    maxGuests:         Infinity,
    advancedExports:   true,
    aiFeatures:        true,
    collaboration:     true,
  },
};

// ── Plan display metadata ─────────────────────────────────────────────────────

export const PLAN_META = {
  free: {
    label:       "חינמי",
    labelEn:     "Free",
    color:       "#888",
    bgColor:     "#f4f4f5",
    borderColor: "#e5e7eb",
  },
  pro: {
    label:       "מקצועי",
    labelEn:     "Pro",
    color:       "#1d4ed8",
    bgColor:     "#eff6ff",
    borderColor: "#bfdbfe",
  },
  enterprise: {
    label:       "ארגוני",
    labelEn:     "Enterprise",
    // Was the literal #E8437B — a hardcoded colour outside tokens.css, and
    // --accent measures 3.80:1 on white and 3.63:1 on the cream ground below,
    // i.e. below the text floor on both. --accent-text is the token for accent
    // ON A LIGHT GROUND (6.87:1). The admin panel does not read these at all
    // any more — it is monochrome — but AccountScreen (customer-facing) does.
    color:       "var(--accent-text)",
    bgColor:     "#fef9f0",
    borderColor: "#f3d99e",
  },
};

// ── Status display metadata ───────────────────────────────────────────────────

export const STATUS_META = {
  active: {
    label:       "פעיל",
    color:       "#166534",
    bgColor:     "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  trialing: {
    label:       "תקופת ניסיון",
    color:       "#854d0e",
    bgColor:     "#fefce8",
    borderColor: "#fde68a",
  },
  cancelled: {
    label:       "בוטל",
    color:       "#b91c1c",
    bgColor:     "#fef2f2",
    borderColor: "#fecaca",
  },
  expired: {
    label:       "פג תוקף",
    color:       "#6b7280",
    bgColor:     "#f9fafb",
    borderColor: "#e5e7eb",
  },
  // Stripe keeps a failing card as `active` through the retry window, and the
  // webhook only raises the separate `payment_past_due` flag. Without an entry
  // here a customer whose card has been declining for three weeks rendered as a
  // green "פעיל" everywhere, so there was no way to see it or act on it.
  past_due: {
    label:       "תשלום נכשל",
    color:       "#b91c1c",
    bgColor:     "#fef2f2",
    borderColor: "#fecaca",
  },
  // Stripe emits these four as well, and every one of them reached the panel
  // unmapped: the raw English key rendered mid-Hebrew-table, and
  // `incomplete_expired` clipped to "te_expired" at 390px. They are ordinary
  // subscription states, not errors — they just had no label.
  incomplete: {
    label:       "ממתין לתשלום ראשון",
    color:       "#854d0e",
    bgColor:     "#fefce8",
    borderColor: "#fde68a",
  },
  incomplete_expired: {
    label:       "תשלום ראשון לא הושלם",
    color:       "#6b7280",
    bgColor:     "#f9fafb",
    borderColor: "#e5e7eb",
  },
  unpaid: {
    label:       "לא שולם",
    color:       "#b91c1c",
    bgColor:     "#fef2f2",
    borderColor: "#fecaca",
  },
  paused: {
    label:       "מושהה",
    color:       "#6b7280",
    bgColor:     "#f9fafb",
    borderColor: "#e5e7eb",
  },
};

/** Statuses that need somebody to act. The panel's ONE semantic colour. */
export const ALARMING_STATUSES = new Set(["past_due", "unpaid"]);

/** The status to DISPLAY — delinquency outranks the nominal status. */
export function displayStatus(sub) {
  return sub?.payment_past_due ? "past_due" : (sub?.status || "expired");
}

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Returns the full limits object for a given plan key.
 * Falls back to free limits for unknown plan values.
 */
/**
 * Look a key up in one of these maps WITHOUT reading through the prototype
 * chain.
 *
 * `plan` and `status` are plain text columns written by the Stripe webhook, so
 * they are not host-reachable today — but `PLAN_LIMITS["toString"]` returns a
 * FUNCTION, and a function is truthy, so `?? PLAN_LIMITS.free` never fired:
 * measured, `getPlanLimits("toString").maxGuests` is `undefined`,
 * `canAddGuest(0).withinPlan` is `false` and `slotsLeft` is `NaN`. The account
 * is locked out of everything instead of falling back to free. `isKnownPlan`
 * had the same hole in the other direction — it answered TRUE for "constructor".
 *
 * One helper rather than four fixes, so the next map added here inherits it.
 */
function own(map, key) {
  return typeof key === "string" && Object.hasOwn(map, key) ? map[key] : undefined;
}

export function getPlanLimits(plan) {
  return own(PLAN_LIMITS, plan) ?? PLAN_LIMITS.free;
}

/**
 * Returns the Hebrew display label for a plan key.
 * E.g. getPlanLabel("pro") → "מקצועי"
 */
export function getPlanLabel(plan) {
  // Never fall through to the raw key. A DB value the panel does not know
  // rendered as `enterprise_annual` mid-Hebrew-table and read as a label.
  return own(PLAN_META, plan)?.label ?? (plan ? "תוכנית לא מוכרת" : "—");
}

/** False when the raw DB value has no Hebrew label — show it in a title. */
export function isKnownPlan(plan) {
  return !!own(PLAN_META, plan);
}

/**
 * Returns the Hebrew display label for a subscription status value.
 * E.g. getStatusLabel("trialing") → "תקופת ניסיון"
 */
export function getStatusLabel(status) {
  return own(STATUS_META, status)?.label ?? (status ? "סטטוס לא מוכר" : "—");
}

/** False when the raw DB value has no Hebrew label — show it in a title. */
export function isKnownStatus(status) {
  return !!own(STATUS_META, status);
}

// hasFeature() lived here and was never imported anywhere in the repo — the
// question it answered is asked through getPlanLimits() directly.

// ── Ordered plan list (for UI pickers, upgrade prompts, etc.) ─────────────────
export const PLAN_KEYS   = ["free", "pro", "enterprise"];
// past_due first: it is the only one that needs somebody to act on it.
export const STATUS_KEYS = [
  "past_due", "unpaid", "active", "trialing",
  "incomplete", "incomplete_expired", "paused", "cancelled", "expired",
];

/** The metadata for a plan key, or undefined. Prototype-safe — see own(). */
export function getPlanMeta(plan) { return own(PLAN_META, plan); }

/** The metadata for a status key, or undefined. Prototype-safe — see own(). */
export function getStatusMeta(status) { return own(STATUS_META, status); }
