// ── Stripe payment configuration ─────────────────────────────────────────────
//
// STATUS: INACTIVE — scaffolding only.
// No real Stripe calls, checkout sessions, or charges are made yet.
// This file is the single source of truth for all Stripe constants and helpers
// once billing is activated in a future phase.
//
// ENVIRONMENT VARIABLES
// ─────────────────────
// Client-side (add to .env.local, exposed to browser via Vite VITE_ prefix):
//   VITE_STRIPE_PUBLISHABLE_KEY   pk_live_… or pk_test_…
//
// Server-side only (set in Supabase Edge Function secrets — NEVER in VITE_ vars):
//   STRIPE_SECRET_KEY             sk_live_… or sk_test_…
//   STRIPE_WEBHOOK_SECRET         whsec_… (from Stripe Dashboard → Webhooks)
//   STRIPE_PRO_PRICE_ID           price_… (Pro monthly or yearly price ID)
//   STRIPE_ENTERPRISE_PRICE_ID    price_… (Enterprise price ID)
//
// To add a new plan price (e.g. annual billing):
//   1. Create the price in Stripe Dashboard → Products
//   2. Add the price ID to Supabase Edge Function secrets
//   3. Add it to PRICE_PLAN_MAP below
//   4. Update getStripePriceForPlan() to return it
// ─────────────────────────────────────────────────────────────────────────────

// ── Client-safe config ────────────────────────────────────────────────────────

/**
 * Stripe publishable key from VITE_ env var.
 * null when not yet configured — Stripe.js must not be initialised until
 * this is set.
 */
export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || null;

/** True when Stripe client-side is configured and ready to use. */
export const isStripeConfigured = !!STRIPE_PUBLISHABLE_KEY;

// ── Plan → Price mapping ──────────────────────────────────────────────────────
//
// Price IDs live in server-side env vars (Supabase Edge Function secrets).
// These placeholder null values will be replaced by the Edge Function layer:
//   Deno.env.get("STRIPE_PRO_PRICE_ID")
//   Deno.env.get("STRIPE_ENTERPRISE_PRICE_ID")
//
// The map is exported here for documentation and type reference only.
// Client code never reads price IDs directly — it passes the plan key to an
// Edge Function which resolves the price server-side.

export const PLAN_PRICE_MAP = {
  free:       null,                // no Stripe price — free plan has no billing
  pro:        null,                // STRIPE_PRO_PRICE_ID (server-side)
  enterprise: null,                // STRIPE_ENTERPRISE_PRICE_ID (server-side)
};

// ── Plan / price helpers ──────────────────────────────────────────────────────

/**
 * Returns the Stripe price ID for a given plan key.
 *
 * In the browser (client bundle): always returns null — price IDs are
 * server-side only.
 *
 * In Edge Functions: replace PLAN_PRICE_MAP values with:
 *   pro:        Deno.env.get("STRIPE_PRO_PRICE_ID"),
 *   enterprise: Deno.env.get("STRIPE_ENTERPRISE_PRICE_ID"),
 *
 * @param {string} plan  — "free" | "pro" | "enterprise"
 * @returns {string|null}
 */
export function getStripePriceForPlan(plan) {
  return PLAN_PRICE_MAP[plan] ?? null;
}

/**
 * Maps a Stripe price ID back to a local plan key.
 * Used in webhook handlers to determine which plan to activate.
 *
 * In Edge Functions, build the reverse map from live env vars before calling.
 *
 * @param {string|null} priceId — Stripe price ID from subscription object
 * @returns {string|null}  plan key, or null if unrecognised
 */
export function getPlanFromStripePrice(priceId) {
  if (!priceId) return null;
  const entry = Object.entries(PLAN_PRICE_MAP).find(([, p]) => p === priceId);
  return entry ? entry[0] : null;
}

/**
 * True when the plan is a paying tier (pro or enterprise).
 * Free plan and null/unknown plans return false.
 *
 * @param {string|null} plan
 * @returns {boolean}
 */
export function isPaidPlan(plan) {
  return plan === "pro" || plan === "enterprise";
}

// ── Stripe status → Hebrew label ──────────────────────────────────────────────
//
// Stripe subscription statuses (distinct from the app's internal status values).
// Stripe docs: https://stripe.com/docs/billing/subscriptions/overview#subscription-statuses

const STRIPE_STATUS_LABELS = {
  active:             "פעיל",
  trialing:           "תקופת ניסיון",
  past_due:           "תשלום באיחור",
  canceled:           "בוטל",             // Stripe uses American "canceled" spelling
  unpaid:             "לא שולם",
  incomplete:         "בתהליך",
  incomplete_expired: "פג תוקף (לא הושלם)",
  paused:             "מושהה",
};

/**
 * Returns a Hebrew display label for a raw Stripe subscription status string.
 * Falls back to the raw value when the status is unrecognised.
 *
 * @param {string|null} stripeStatus
 * @returns {string}
 */
export function getBillingStatusLabel(stripeStatus) {
  if (!stripeStatus) return "—";
  return STRIPE_STATUS_LABELS[stripeStatus] ?? stripeStatus;
}

// ── Webhook event constants ───────────────────────────────────────────────────
//
// Use these constants as the `event.type` values in the stripe-webhook
// Edge Function to avoid typos and enable IDE autocomplete.
//
// Each constant documents the expected handling action.

export const STRIPE_EVENTS = {
  // ── Checkout ──────────────────────────────────────────────────────────────

  /**
   * checkout.session.completed
   *
   * Fired when a customer completes a Stripe Checkout session (payment confirmed).
   *
   * Handling steps:
   *  1. Retrieve the session: stripe.checkout.sessions.retrieve(session.id, { expand: ['subscription'] })
   *  2. Map session.metadata.user_id (set when creating the session) to our user
   *  3. Map subscription.items.data[0].price.id → plan key via getPlanFromStripePrice()
   *  4. Upsert subscriptions row:
   *       { user_id, plan, status: 'active', stripe_customer_id, stripe_subscription_id,
   *         stripe_price_id, current_period_end, started_at: now() }
   *     ON CONFLICT (stripe_subscription_id) DO UPDATE
   *  5. Update profiles.stripe_customer_id if not yet set
   */
  CHECKOUT_SESSION_COMPLETED: "checkout.session.completed",

  // ── Subscription lifecycle ────────────────────────────────────────────────

  /**
   * customer.subscription.updated
   *
   * Fired when a subscription is upgraded, downgraded, trial converts,
   * or cancel_at_period_end is set.
   *
   * Handling steps:
   *  1. Map subscription.items.data[0].price.id → new plan key
   *  2. Update subscriptions row:
   *       { plan, status (map Stripe status → internal status),
   *         current_period_end, stripe_price_id, updated_at: now() }
   *     WHERE stripe_subscription_id = event.data.object.id
   *       AND is_manually_managed = false   ← skip manual overrides
   *  3. If subscription.cancel_at_period_end = true:
   *       set expires_at = current_period_end (access until end of period)
   *  4. Stripe → internal status mapping:
   *       active             → 'active'
   *       trialing           → 'trialing'
   *       past_due           → 'active' (grace period — do NOT revoke yet)
   *       canceled / unpaid  → 'cancelled'
   */
  SUBSCRIPTION_UPDATED: "customer.subscription.updated",

  /**
   * customer.subscription.deleted
   *
   * Fired when a subscription is fully cancelled (period ended after cancel).
   *
   * Handling steps:
   *  1. Update subscriptions row:
   *       { status: 'cancelled', expires_at: current_period_end, updated_at: now() }
   *     WHERE stripe_subscription_id = event.data.object.id
   *       AND is_manually_managed = false
   *  2. Do NOT delete the row — preserve billing history.
   *  3. usePlan() will return 'free' because query filters status IN ('active', 'trialing').
   */
  SUBSCRIPTION_DELETED: "customer.subscription.deleted",

  // ── Invoices ──────────────────────────────────────────────────────────────

  /**
   * invoice.payment_failed
   *
   * Fired when an automatic renewal payment fails.
   * Stripe will retry automatically (Smart Retries). Do not revoke access immediately.
   *
   * Handling steps (grace-period approach):
   *  1. Set subscriptions.payment_past_due = true, updated_at = now()
   *     WHERE stripe_subscription_id = subscription_id
   *  2. Do NOT change status to 'expired' yet — Stripe will retry.
   *  3. If Stripe exhausts retries → customer.subscription.updated fires with
   *     status = 'past_due' / 'unpaid', then subscription.deleted. Handle there.
   *  4. Optional: send in-app notification to customer.
   */
  INVOICE_PAYMENT_FAILED: "invoice.payment_failed",

  /**
   * invoice.payment_succeeded
   *
   * Fired when a renewal payment succeeds (including after a past_due recovery).
   *
   * Handling steps:
   *  1. Update subscriptions row:
   *       { status: 'active', payment_past_due: false,
   *         current_period_end, expires_at: null, updated_at: now() }
   *     WHERE stripe_subscription_id = invoice.subscription
   */
  INVOICE_PAYMENT_SUCCEEDED: "invoice.payment_succeeded",
};

// ── Webhook implementation ────────────────────────────────────────────────────
//
// The live webhook handler is in supabase/functions/stripe-webhook/index.ts.
// It handles all five events listed in STRIPE_EVENTS above.
// Deploy with: supabase functions deploy stripe-webhook
