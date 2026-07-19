import { getPlanLimits, getPlanLabel } from "../admin/lib/planConfig.js";

// ── Feature gate helpers ──────────────────────────────────────────────────────
//
// Pure functions — no hooks, no side effects.
// All take a `plan` key ("free" | "pro" | "enterprise") as the first argument.
//
// Return shape: { allowed: boolean, ...contextual fields }
//
// Current behaviour: gates are SOFT — callers show messaging but never
// hard-block core user actions. Hard enforcement is a future task.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the user can create another event.
 * @param {string} plan
 * @param {number} currentCount — number of events the user already has
 */
export function canCreateEvent(plan, currentCount) {
  const { maxEvents } = getPlanLimits(plan);
  const allowed = currentCount < maxEvents;
  return {
    allowed,
    limit: maxEvents,
    reason: allowed || maxEvents === Infinity
      ? null
      : `תוכנית ${getPlanLabel(plan)} מאפשרת עד ${maxEvents} ${maxEvents === 1 ? "אירוע" : "אירועים"}`,
  };
}

/**
 * Whether the user can add another guest to an event.
 * @param {string} plan
 * @param {number} currentCount — number of guests already in the event
 */
export function canAddGuest(plan, currentCount) {
  const { maxGuests } = getPlanLimits(plan);
  const allowed = currentCount < maxGuests;
  return {
    allowed,
    limit: maxGuests,
    reason: allowed || maxGuests === Infinity
      ? null
      : `תוכנית ${getPlanLabel(plan)} מאפשרת עד ${maxGuests} אורחים לאירוע`,
  };
}

/**
 * Whether the user's plan includes advanced export formats (PDF, etc.).
 * Free plan gets the basic Excel export; advanced formats require Pro+.
 */
export function canUseAdvancedExports(plan) {
  const { advancedExports } = getPlanLimits(plan);
  return {
    allowed:     advancedExports,
    upgradeNote: advancedExports
      ? null
      : "ייצוא מתקדם (PDF, ייצוא מפורט) — זמין בתוכנית מקצועי ומעלה",
  };
}

/**
 * Whether the user's plan includes AI-powered seating optimization.
 * Requires Enterprise plan.
 */
export function canUseAI(plan) {
  const { aiFeatures } = getPlanLimits(plan);
  return {
    allowed:     aiFeatures,
    upgradeNote: aiFeatures
      ? null
      : "הושבה חכמה מבוססת AI — זמינה בתוכנית ארגוני",
  };
}

/**
 * Whether the user's plan includes multi-user collaboration.
 * Requires Enterprise plan.
 */
export function canUseCollaboration(plan) {
  const { collaboration } = getPlanLimits(plan);
  return {
    allowed:     collaboration,
    upgradeNote: collaboration
      ? null
      : "שיתוף פעולה עם הצוות — זמין בתוכנית ארגוני",
  };
}
