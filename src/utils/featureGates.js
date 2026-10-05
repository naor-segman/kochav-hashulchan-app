import { peopleIn } from "../data/pricingCurve.js";
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
 * Whether the host can start another event.
 *
 * ⚠️ IT COUNTS THE UNPAID ONES, and the argument changed name to say so.
 *
 * It used to take `(plan, currentCount)` and compare the host's TOTAL event
 * count against the account's `maxEvents`. Under one-payment-per-event that is
 * wrong in both directions and the wrong one is punishing: a host who paid ₪690
 * for their wedding still had one event against a limit of one, so buying the
 * package took away their ability to start anything else. They had paid us and
 * got less room than before.
 *
 * The free tier's own words on the pricing page are "אירוע אחד". The honest
 * reading of that, once each event is bought separately, is ONE UNPAID EVENT AT
 * A TIME — plus every event you have paid for. Pay for the wedding and the next
 * event starts free again, which is also the shape that sells: the second
 * purchase is a decision about the second event, not about a plan.
 *
 * `utils/entitlement.js unpaidEventCount(purchases, events)` produces the
 * argument, and `usePlan().unpaidEvents(events)` is the hook that hands it over.
 *
 * @param {number} unpaidCount — events the host has NOT paid for
 */
export function canCreateEvent(unpaidCount) {
  // The allowance is a property of the free tier. There is no account-level plan
  // any more — a host can hold three events on three different packages — so
  // there is no plan to look up here.
  const { maxEvents } = getPlanLimits("free");
  // `withinPlan` is the rule; `allowed` is the rule after the switch above.
  // Both are returned so the limits stay testable while enforcement is off.
  const withinPlan = unpaidCount < maxEvents;
  const allowed    = !PLAN_GATES_ENFORCED || withinPlan;
  return {
    allowed,
    withinPlan,
    limit: maxEvents,
    reason: withinPlan || maxEvents === Infinity
      ? null
      // Names what to DO, which the old message could not: it said the plan
      // allows one event, to someone who had one event and no way forward.
      : maxEvents === 1
        ? "אפשר אירוע אחד ללא תשלום בכל פעם. לפתיחת אירוע נוסף — רכשו את החבילה לאירוע הקיים"
        : `אפשר עד ${maxEvents} אירועים ללא תשלום בכל פעם`,
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
    // "רשומות", not "אורחים". This function is handed `ev.guests.length`, so
    // the number it compares is ROWS — and a row carries `count` people. The
    // message said "אורחים", which meant a host with 400 people in 180 rows
    // read a cap that had nothing to do with the number they were watching.
    // The seat-based cap is canSeatMore() below; this one stays honest about
    // its own unit.
    reason: withinPlan || maxGuests === Infinity
      ? null
      : `תוכנית ${getPlanLabel(plan)} מאפשרת עד ${maxGuests} רשומות לאירוע`,
  };
}

/**
 * Whether automatic seating may run for this many PEOPLE. Checklist 31.
 *
 * This is the only numeric limit a customer meets, and it is the one the free
 * tier is built around: seating is free up to `maxSeatedSeats` people so a host
 * can watch it work on a small event, and paid past it.
 *
 * ⚠️ SEATS, NOT ROWS, and that distinction is the whole reason this function
 * exists rather than reusing canAddGuest. `guestSeats(g) = g.count || 1` is the
 * invariant the seating engine, the entrance counter and the name-tag printer
 * all share: one row can be a family of five. A cap applied to `guests.length`
 * would let 200 rows through as 600 people, or block a 190-row event that is
 * only 340 people.
 *
 * This used to claim that "callers pass the guest ARRAY, not a count, so there is
 * no way to hand this the wrong number." That was false and it was the dangerous
 * kind of false: `canSeatMore("free", guests.length)` returned
 * `{ seats: 0, withinPlan: true }` — it FAILED OPEN, silently, on exactly the
 * mistake the function exists to prevent. And `canAddGuest(plan, currentCount)`
 * sits a few lines above it taking a count as its second argument, so the wrong
 * call is the natural one to write. It throws now.
 *
 * Declined guests are excluded, exactly as the seating screen excludes them —
 * someone who said no is not seated and must not consume the allowance.
 *
 * @param {string} plan
 * @param {Array<{count?: number, rsvp?: string}>} guests — the event's guest rows
 */
export function canSeatMore(plan, guests) {
  if (!Array.isArray(guests)) {
    // Loud, not lenient. A number here is the seats-versus-rows bug arriving by
    // the front door, and returning `{ seats: 0, allowed: true }` for it is the
    // one behaviour this function must never have.
    throw new TypeError(
      `canSeatMore expects the guest ARRAY, got ${typeof guests} — pass ev.guests, not a count`
    );
  }
  const { maxSeatedSeats } = getPlanLimits(plan);
  // peopleIn: one rule for the gate and the price (pricingCurve.js). Null rows
  // are nobody — [null, null] once counted as two people who do not exist.
  const seats = peopleIn(guests);

  const withinPlan = seats <= maxSeatedSeats;
  const allowed    = !PLAN_GATES_ENFORCED || withinPlan;
  return {
    allowed,
    withinPlan,
    seats,
    limit: maxSeatedSeats,
    reason: withinPlan || maxSeatedSeats === Infinity
      ? null
      // "200 מתוך 340" reverses in an RTL line — bug class 7 — so the numbers
      // are anchored by Hebrew words and never sit either side of a bare
      // separator.
      : `ההושבה האוטומטית בתוכנית ${getPlanLabel(plan)} עובדת עד ${maxSeatedSeats} אנשים. באירוע הזה יש ${seats}.`,
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
 * Whether the user's plan includes the advanced exports. There is no PDF
 * export in the product; the upgrade note used to promise one (checklist 36).
 * Free plan gets the basic Excel export; advanced formats require Pro+.
 */
export function canUseAdvancedExports(plan) {
  const { advancedExports } = getPlanLimits(plan);
  // Same contract as canCreateEvent: `withinPlan` is the rule, `allowed` is the
  // rule after PLAN_GATES_ENFORCED. These three returned the raw rule instead,
  // so they could never be wired to a call site without enforcing the split
  // while the switch was off — which is why they had zero call sites and
  // flipping the switch would have enforced nothing for them.
  /* The plan NAME comes from getPlanLabel, it is not typed here. These three
     strings said "מקצועי" and "ארגוני" — the labels the packages had before they
     were renamed to הרשימה בידיים / בלי הפתעות / אנחנו שם איתכם. Two of them are
     customer-facing (canUseAI's note reaches FloorPlanEditor), so a customer would
     have been sent to a plan that does not appear anywhere on the site. */
  return {
    withinPlan:  advancedExports,
    allowed:     !PLAN_GATES_ENFORCED || advancedExports,
    upgradeNote: advancedExports
      ? null
      // "(PDF, …)" promised a format that does not exist (checklist 36).
      : `ייצוא מתקדם — זמין בחבילת ${getPlanLabel("pro")} ומעלה`,
  };
}

/**
 * Whether the plan includes the AI features — today that is ONE thing, and it is
 * not seating: table detection from an uploaded venue sketch
 * (FloorPlanEditor.handleDetect). Available from the ₪690 package up, because
 * that is the package that sells it.
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
      : `זיהוי שולחנות מסקיצת האולם — זמין בחבילת ${getPlanLabel("pro")} ומעלה`,
  };
}

/**
 * Whether the plan includes the shared family table (CollabScreen behind a share
 * token). TRUE on every plan, because the free package sells it — see
 * planConfig.js. Zero call sites; kept so the rule stays beside the others.
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
      : `טבלה שיתופית למשפחה — זמינה בחבילת ${getPlanLabel("pro")} ומעלה`,
  };
}
