// ── Plan definitions ──────────────────────────────────────────────────────────
//
// Single source of truth for plan tiers, feature limits, and status labels.
// No payment logic here — this is purely definitional config for the admin UI
// and future customer-facing feature gating.
//
// DB status column values: active | trialing | cancelled | expired
// DB plan column values:   free  | pro       | enterprise

// ── Plan limit shapes ─────────────────────────────────────────────────────────

/**
 * ── The limits, rewritten for the per-event model (checklist 31) ────────────
 *
 * The DB keys stay `free` / `pro` / `enterprise` because `subscriptions.plan`
 * has a CHECK constraint on exactly those three strings; renaming them is a
 * migration, and the customer never sees them. They now mean:
 *
 *   free        "הרשימה בידיים"    — ₪0, one event
 *   pro         "בלי הפתעות"       — ₪690 per event
 *   enterprise  "אנחנו שם איתכם"   — ₪1,290 per event
 *
 * TWO CHANGES, and both are the point of the model:
 *
 * 1. `maxGuests` is Infinity on every plan, free included. It was 80, which is
 *    below every Israeli wedding — so the free tier could not be used for the
 *    thing the product is for, and the free tier IS the distribution channel:
 *    `messageSignature()` puts "נבנה עם <brand>" and the site link on every
 *    guest message, so one free event is several hundred strangers seeing the
 *    name. A cap that makes the free tier useless switches that channel off.
 *
 * 2. `maxSeatedSeats` is the new cap, and it is the only numeric one that
 *    reaches a customer. Free gets automatic seating up to 200 PEOPLE so a host
 *    can see it work; past that it is paid. 200 is deliberately below an
 *    Israeli wedding (400–650 invitees, measured), so the generosity costs
 *    nothing — and it is deliberately AT a competitor's free ceiling, because
 *    Lunsoul give automatic seating away free to 200 guests and a comparison
 *    page must not be able to call us the meaner one.
 *
 * ⚠️ SEATS, NOT ROWS. `maxGuests` was compared against `ev.guests.length`,
 * which counts ROWS — and a row carries `count` people. "עד 500 אורחים" meant
 * 500 rows, i.e. 750–1,000 actual people. The new cap is named `maxSeatedSeats`
 * so the unit is in the name, and `featureGates.canSeatMore` counts it the way
 * `arrival.js` seatsOf() does — Math.max(1, Number(count) || 1).
 *
 * NOT "the same arithmetic the seating engine uses", which is what this said and
 * it is false: `guestSeats` in seating.js is `g.count || 1` with no coercion, so
 * a string "4" makes its reduce CONCATENATE (0 + "4" + "4" → "044") and a
 * negative count subtracts seats. canSeatMore is the correct one of the two; the
 * latent bug is in seating.js and only guestForm's 1–50 clamp keeps it off.
 */
export const PLAN_LIMITS = {
  free: {
    maxEvents:         1,
    maxGuests:         Infinity,
    maxSeatedSeats:    200,
    advancedExports:   false,
    aiFeatures:        false,
    /* TRUE on the free tier, because the free tier SELLS it: "טבלה שיתופית:
       המשפחה ממלאת מהטלפון, בזמן אמת, בלי חשבון" is a free-tier line, and it is
       CollabScreen behind a share token. So this flag now differentiates
       nothing — which is the honest state, and better than a flag that would
       delete a free-tier bullet the day enforcement is switched on.
       `canUseCollaboration` still has zero call sites; it is kept so the rule
       lives next to the others rather than being invented at a call site. */
    collaboration:     true,
  },
  pro: {
    maxEvents:         Infinity,
    maxGuests:         Infinity,
    maxSeatedSeats:    Infinity,
    advancedExports:   true,
    /* TRUE, and it was false — which made this the one gate that contradicted a
       line we charge for. `pricing.js` sells "מעלים את סקיצת האולם — והמערכת
       מזהה את השולחנות מהתמונה" inside the ₪690 tier, and that is `handleDetect`
       in FloorPlanEditor.jsx:339, guarded by `canUseAI(plan)` → this flag. With
       it false, only `enterprise` could run detection, and the ₪690 customer who
       clicked the headline feature of that group would have been told it is
       available in a plan that no longer exists.
       It worked today only because PLAN_GATES_ENFORCED is false, i.e. the bug
       was invisible until the one moment it matters — the day we start charging.
       That is bug class 6 on the money surface. */
    aiFeatures:        true,
    collaboration:     true,
  },
  enterprise: {
    maxEvents:         Infinity,
    maxGuests:         Infinity,
    maxSeatedSeats:    Infinity,
    advancedExports:   true,
    aiFeatures:        true,
    collaboration:     true,
  },
};

// ── Plan display metadata ─────────────────────────────────────────────────────

export const PLAN_META = {
  free: {
    label:       "הרשימה בידיים",
    labelEn:     "Free",
    // Tokens, not hex (107, 29.9). Each pair measured on its own ground:
    // --muted on --bg 4.86:1.
    color:       "var(--muted)",
    bgColor:     "var(--bg)",
    borderColor: "var(--border)",
  },
  pro: {
    label:       "בלי הפתעות",
    labelEn:     "Event",
    // Was Tailwind blue — outside the palette. --accent-text on --accent-bg 6.04:1.
    color:       "var(--accent-text)",
    bgColor:     "var(--accent-bg)",
    borderColor: "var(--accent-border)",
  },
  enterprise: {
    label:       "אנחנו שם איתכם",
    labelEn:     "Enterprise",
    // Was the literal #E8437B — a hardcoded colour outside tokens.css, and
    // --accent measures 3.80:1 on white and 3.63:1 on the cream ground below,
    // i.e. below the text floor on both. --accent-text is the token for accent
    // ON A LIGHT GROUND (6.87:1). The admin panel does not read these at all
    // any more — it is monochrome — but AccountScreen (customer-facing) does.
    // Distinct from `pro` without a second hue: ink on blush, 16.06:1.
    color:       "var(--text)",
    bgColor:     "var(--blush-soft)",
    borderColor: "var(--blush-line)",
    /* The ONE thing this package has that the ₪690 package does not: a person
       from us standing at the door. It lives in PLAN_META and not in PLAN_LIMITS
       on purpose — PLAN_LIMITS is read by the gate helpers, and a service
       delivered by a human must never become something the software claims to
       check. It is display metadata, and the only consumer is the plan card.

       Without it the two paid cards were byte-identical: every limit in
       PLAN_LIMITS is now the same for `pro` and `enterprise` (both unlimited,
       both AI, both collaboration), which is CORRECT — the difference is not a
       software capability — so a comparison table built only from limits could
       not tell them apart on the screen where someone decides to pay. */
    humanService: "מנהל הושבה שלנו בכניסה — שירות בשטח",
  },
};

// ── Status display metadata ───────────────────────────────────────────────────

export const STATUS_META = {
  active: {
    label:       "פעיל",
    color:       "var(--green-dark)",      // 7.14:1 on --green-bg
    bgColor:     "var(--green-bg)",
    borderColor: "var(--green-border)",
  },
  trialing: {
    label:       "תקופת ניסיון",
    color:       "var(--warn)",            // 4.70:1 on --warn-bg
    bgColor:     "var(--warn-bg)",
    borderColor: "var(--warn-border)",
  },
  cancelled: {
    label:       "בוטל",
    color:       "var(--red-text)",        // 5.53:1 on --red-bg
    bgColor:     "var(--red-bg)",
    borderColor: "var(--red-border)",
  },
  expired: {
    label:       "פג תוקף",
    color:       "var(--muted)",
    bgColor:     "var(--bg)",
    borderColor: "var(--border)",
  },
  // Stripe keeps a failing card as `active` through the retry window, and the
  // webhook only raises the separate `payment_past_due` flag. Without an entry
  // here a customer whose card has been declining for three weeks rendered as a
  // green "פעיל" everywhere, so there was no way to see it or act on it.
  past_due: {
    label:       "תשלום נכשל",
    color:       "var(--red-text)",
    bgColor:     "var(--red-bg)",
    borderColor: "var(--red-border)",
  },
  /* `incomplete`, `incomplete_expired`, `unpaid` and `paused` stood here, and
     were removed in checklist 94. They are Stripe SUBSCRIPTION states, and two
     facts make them unreachable:
       1. subscriptions.status carries CHECK (status IN ('active', 'trialing',
          'cancelled', 'expired')) — unchanged since 20260524000000 — so none of
          the four can ever be stored. The old webhook translated Stripe's states
          into those four through mapStripeStatus for exactly that reason.
       2. Since 27.9 purchases are one-time (mode: "payment"): there is no
          Subscription object, so Stripe produces none of these states at all.
     They were labels for values the database refuses, offered as filter
     options in the admin panel that could never match a row. If one ever did
     appear, getStatusLabel still says "סטטוס לא מוכר" with the raw value in a
     title — the graceful path, not the invisible one.

     `past_due` stays. It is not a DB status either, but it IS reachable:
     displayStatus() derives it from the payment_past_due flag, which an admin
     can still set by hand. */
};

/** Statuses that need somebody to act. The panel's ONE semantic colour. */
// `unpaid` left with the other three unreachable Stripe states — see STATUS_META.
export const ALARMING_STATUSES = new Set(["past_due"]);

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
 * E.g. getPlanLabel("pro") → "בלי הפתעות"   (it said "מקצועי" — the label was
 * renamed with the packages and this example was left behind)
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
// Exactly the four the DB CHECK allows, plus past_due, which displayStatus()
// derives from a flag. planConfig.test.js reads the CHECK out of the migration
// and fails if this list and the schema ever disagree.
export const STATUS_KEYS = ["past_due", "active", "trialing", "cancelled", "expired"];

/** The metadata for a plan key, or undefined. Prototype-safe — see own(). */
export function getPlanMeta(plan) { return own(PLAN_META, plan); }

/** The metadata for a status key, or undefined. Prototype-safe — see own(). */
export function getStatusMeta(status) { return own(STATUS_META, status); }
