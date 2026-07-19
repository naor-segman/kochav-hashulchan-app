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
    color:       "#be7a38",
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
};

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Returns the full limits object for a given plan key.
 * Falls back to free limits for unknown plan values.
 */
export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

/**
 * Returns the Hebrew display label for a plan key.
 * E.g. getPlanLabel("pro") → "מקצועי"
 */
export function getPlanLabel(plan) {
  return PLAN_META[plan]?.label ?? plan ?? "—";
}

/**
 * Returns the Hebrew display label for a subscription status value.
 * E.g. getStatusLabel("trialing") → "תקופת ניסיון"
 */
export function getStatusLabel(status) {
  return STATUS_META[status]?.label ?? status ?? "—";
}

/**
 * Checks whether a plan includes a specific named feature.
 *
 * Feature keys match the PLAN_LIMITS shape:
 *   "advancedExports" | "aiFeatures" | "collaboration"
 *
 * For numeric limits, returns true when the value is Infinity.
 *
 * Usage:
 *   hasFeature("pro", "advancedExports")  → true
 *   hasFeature("free", "aiFeatures")      → false
 *   hasFeature("enterprise", "maxEvents") → true  (Infinity)
 */
export function hasFeature(plan, feature) {
  const limits = getPlanLimits(plan);
  const val = limits[feature];
  if (typeof val === "boolean") return val;
  if (typeof val === "number")  return val === Infinity;
  return false;
}

// ── Ordered plan list (for UI pickers, upgrade prompts, etc.) ─────────────────
export const PLAN_KEYS   = ["free", "pro", "enterprise"];
export const STATUS_KEYS = ["active", "trialing", "cancelled", "expired"];
