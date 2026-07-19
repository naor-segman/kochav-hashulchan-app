import { isStripeConfigured } from "../admin/lib/stripeConfig.js";
import { supabase } from "./supabase.js";

export { isStripeConfigured };

// ── stripe.js — frontend billing client ───────────────────────────────────────
//
// All Stripe API calls that touch secret credentials go through Supabase Edge
// Functions. This file only calls those functions and redirects the browser.
// No secret keys ever reach the browser.
//
// Environment variables required (frontend):
//   VITE_STRIPE_PUBLISHABLE_KEY  — activates isStripeConfigured
//
// Environment variables required (Edge Functions — Supabase secrets, not .env):
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   STRIPE_PRO_PRICE_ID
//   STRIPE_ENTERPRISE_PRICE_ID
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout session for the given plan.
 * Calls the `create-checkout-session` Supabase Edge Function and returns
 * the hosted Checkout URL. Redirect the browser to this URL to start checkout.
 *
 * Throws when Stripe or Supabase is not configured, or on Edge Function error.
 *
 * @param {string} planKey   — "pro" | "enterprise"
 * @param {string} returnUrl — Full URL to redirect to after checkout completes or cancels
 * @returns {Promise<string>} Stripe hosted Checkout URL
 */
export async function createCheckoutSession(planKey, returnUrl) {
  if (!isStripeConfigured) {
    throw new Error("Stripe is not configured — add VITE_STRIPE_PUBLISHABLE_KEY to .env.local");
  }
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    body: { plan: planKey, returnUrl },
  });

  if (error) throw new Error(error.message ?? "Edge Function error");
  if (!data?.url) throw new Error("Edge Function did not return a checkout URL");
  return data.url;
}

/**
 * Create a Stripe Billing Portal session so the user can manage or cancel
 * their active subscription.
 * Returns the portal URL. Redirect the browser to this URL to open the portal.
 *
 * Throws when Stripe or Supabase is not configured, the user has no Stripe
 * customer, or the Edge Function returns an error.
 *
 * @param {string} returnUrl — Full URL to return to after the portal session ends
 * @returns {Promise<string>} Stripe Billing Portal URL
 */
export async function createBillingPortalSession(returnUrl) {
  if (!isStripeConfigured) {
    throw new Error("Stripe is not configured — add VITE_STRIPE_PUBLISHABLE_KEY to .env.local");
  }
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase.functions.invoke("create-billing-portal", {
    body: { returnUrl },
  });

  if (error) throw new Error(error.message ?? "Edge Function error");
  if (!data?.url) throw new Error("Edge Function did not return a billing portal URL");
  return data.url;
}
