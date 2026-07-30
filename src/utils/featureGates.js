import { getPlanLimits, getPlanLabel } from "../admin/lib/planConfig.js";

// ── Feature gate helpers ──────────────────────────────────────────────────────
//
// Pure functions — no hooks, no side effects.
// All take a `plan` key ("free" | "pro" | "enterprise") as the first argument.
//
// Return shape: { allowed: boolean, ...contextual fields }
//
// ── Are the limits enforced at all? ──
//
// They were, and the result was incoherent: the account screen said "we are in
// beta, everything is available at no charge", the upgrade button next to it
// was disabled and read "coming soon", and meanwhile a free account was cut off
// at one event and eighty guests with nowhere to go. Nobody could pay to get
// past a wall that was already up.
//
// So the wall comes down until there is something to sell. The rules stay in
// code, in one place, and flipping this to true turns them on everywhere at
// once — this is a switch, not a decision about what free should include.
//
// The limits themselves live in admin/lib/planConfig.js and are untouched.
export const PLAN_GATES_ENFORCED = false;
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether the user can create another event.
 * @param {string} plan
 * @param {number} currentCount — number of events the user already has
 */
export function canCreateEvent(plan, currentCount) {
  const { maxEvents } = getPlanLimits(plan);
  // `withinPlan` is the rule; `allowed` is the rule after the switch above.
  // Both are returned so the limits stay testable while enforcement is off.
  const withinPlan = currentCount < maxEvents;
  const allowed    = !PLAN_GATES_ENFORCED || withinPlan;
  return {
    allowed,
    withinPlan,
    limit: maxEvents,
    reason: withinPlan || maxEvents === Infinity
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
  const withinPlan = currentCount < maxGuests;
  const allowed    = !PLAN_GATES_ENFORCED || withinPlan;
  return {
    allowed,
    withinPlan,
    limit: maxGuests,
    reason: withinPlan || maxGuests === Infinity
      ? null
      : `תוכנית ${getPlanLabel(plan)} מאפשרת עד ${maxGuests} אורחים לאירוע`,
  };
}

/**
 * How many more guest rows this plan allows — Infinity when unlimited or when
 * the gates are off.
 *
 * Exists so a bulk paste has one answer to ask for. The paste path used to do
 * its own `currentCount + rows.length > maxGuests` arithmetic and then refuse
 * the whole paste, which meant someone pasting 400 names into an 80-row plan
 * got nothing at all and no way to find out which 80 would have fitted.
 *
 * @param {string} plan
 * @param {number} currentCount — guest rows already in the event
 */
export function guestSlotsLeft(plan, currentCount) {
  if (!PLAN_GATES_ENFORCED) return Infinity;
  return planGuestSlotsLeft(plan, currentCount);
}

/** The same count ignoring the switch — the plan rule on its own. */
export function planGuestSlotsLeft(plan, currentCount) {
  const { maxGuests } = getPlanLimits(plan);
  if (maxGuests === Infinity) return Infinity;
  return Math.max(0, maxGuests - currentCount);
}

/**
 * Whether the user's plan includes advanced export formats (PDF, etc.).
 * Free plan gets the basic Excel export; advanced formats require Pro+.
 */
export function canUseAdvancedExports(plan) {
  const { advancedExports } = getPlanLimits(plan);
  // Same contract as canCreateEvent: `withinPlan` is the rule, `allowed` is the
  // rule after PLAN_GATES_ENFORCED. These three returned the raw rule instead,
  // so they could never be wired to a call site without enforcing the split
  // while the switch was off — which is why they had zero call sites and
  // flipping the switch would have enforced nothing for them.
  return {
    withinPlan:  advancedExports,
    allowed:     !PLAN_GATES_ENFORCED || advancedExports,
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
  // Same contract as canCreateEvent: `withinPlan` is the rule, `allowed` is the
  // rule after PLAN_GATES_ENFORCED. These three returned the raw rule instead,
  // so they could never be wired to a call site without enforcing the split
  // while the switch was off — which is why they had zero call sites and
  // flipping the switch would have enforced nothing for them.
  return {
    withinPlan:  aiFeatures,
    allowed:     !PLAN_GATES_ENFORCED || aiFeatures,
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
  // Same contract as canCreateEvent: `withinPlan` is the rule, `allowed` is the
  // rule after PLAN_GATES_ENFORCED. These three returned the raw rule instead,
  // so they could never be wired to a call site without enforcing the split
  // while the switch was off — which is why they had zero call sites and
  // flipping the switch would have enforced nothing for them.
  return {
    withinPlan:  collaboration,
    allowed:     !PLAN_GATES_ENFORCED || collaboration,
    upgradeNote: collaboration
      ? null
      : "שיתוף פעולה עם הצוות — זמין בתוכנית ארגוני",
  };
}
