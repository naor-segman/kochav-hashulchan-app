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
//   3. Resolve it there — the client never sees a price ID
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
// PLAN_PRICE_MAP, getStripePriceForPlan() and getPlanFromStripePrice() lived
// here as a placeholder chain whose values were all null, and nothing in the
// repo ever imported any of the three — the live resolution happens in
// supabase/functions/stripe-webhook, from Edge Function secrets. A price map
// that is never read is not documentation, it is a second source of truth
// waiting to disagree with the first.

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

// Stripe's own subscription statuses are mapped to Hebrew in
// admin/lib/planConfig.js STATUS_META, which is the map the panel and the
// customer account screen both read. getBillingStatusLabel() was a second,
// never-imported copy of the same table.

// ── Webhook event constants ───────────────────────────────────────────────────
//
// STRIPE_EVENTS was an exported constant map of the five event.type strings
// plus their handling notes. Nothing imported it — the Edge Function matches
// the raw strings — so the constant was dead and only the notes were load
// bearing. The notes now live with the handler they describe.
//
//   checkout.session.completed      → upsert subscriptions row, status active
//   customer.subscription.updated   → remap plan + status, honour
//                                     is_manually_managed, set expires_at when
//                                     cancel_at_period_end
//   customer.subscription.deleted   → status cancelled, keep the row
//   invoice.payment_failed          → payment_past_due = true, do NOT revoke
//   invoice.payment_succeeded       → status active, payment_past_due = false

// ── Webhook implementation ────────────────────────────────────────────────────
//
// The live webhook handler is in supabase/functions/stripe-webhook/index.ts.
// It handles all five events listed above.
// Deploy with: supabase functions deploy stripe-webhook
