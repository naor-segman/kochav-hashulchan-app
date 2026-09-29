import { isStripeConfigured } from "../admin/lib/stripeConfig.js";
import { supabase } from "./supabase.js";
import { readFunctionFailure } from "../utils/functionError.js";

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

/* What a host reads when a billing call fails (third review 30.9, סב60/CP-H5).
 *
 * `if (error) throw new Error(error.message)` showed every failure as "Edge
 * Function returned a non-2xx status code" — English, and empty: the function's
 * own answer sits on the response body, which that line never read. That
 * included the one message written in Hebrew for the host, "האירוע הזה כבר
 * נרכש", which therefore never reached the screen. The body is read now; a
 * Hebrew sentence from the server is shown as is, anything else (English
 * diagnostics meant for the log) becomes a sentence the host can act on. */
const HEBREW = /[\u0590-\u05FF]/;
export async function billingErrorMessage(error, data, fallback) {
  if (error?.name === "FunctionsFetchError") return "אין חיבור כרגע — בדקו את החיבור ונסו שוב";
  const f = await readFunctionFailure(error, data);
  if (!f) return fallback;
  const said = f.note || f.code;
  if (HEBREW.test(said)) return said;
  if (f.status === 401) return "פג תוקף ההתחברות — התחברו מחדש ונסו שוב";
  if (f.status === 403) return "האירוע הזה לא נמצא בחשבון שלך — רעננו את הדף ונסו שוב";
  return fallback;
}

const NOT_READY = "התשלום עוד לא זמין כאן — נסו שוב מאוחר יותר";

/**
 * Create a Stripe Checkout session for the given plan.
 * Calls the `create-checkout-session` Supabase Edge Function and returns
 * the hosted Checkout URL. Redirect the browser to this URL to start checkout.
 *
 * Throws when Stripe or Supabase is not configured, or on Edge Function error.
 *
 * @param {string} planKey   — "pro" | "enterprise"
 * @param {string} returnUrl — Full URL to redirect to after checkout completes or cancels
 * @param {string} eventId   — the CLOUD id of the event being bought (ev.cloudId),
 *                             NOT ev.id. A purchase unlocks one event, and the
 *                             cloud id is the only one the server can verify —
 *                             ev.id is self-declared JSON inside a row the host
 *                             can edit. Required: the function refuses without it.
 * @returns {Promise<string>} Stripe hosted Checkout URL
 */
export async function createCheckoutSession(planKey, returnUrl, eventId) {
  if (!isStripeConfigured) {
    throw new Error(NOT_READY);   // VITE_STRIPE_PUBLISHABLE_KEY is not set
  }
  if (!supabase) {
    throw new Error(NOT_READY);   // Supabase is not configured
  }

  if (!eventId) {
    // Refused here rather than sent, because the failure it prevents is a host
    // paying ₪690 and the purchase landing on no event — or, worse, on every
    // event. The server refuses it too; this is the message a person can read.
    throw new Error("לא ידוע איזה אירוע נרכש — נסו לרענן ולנסות שוב");
  }

  const { data, error } = await supabase.functions.invoke("create-checkout-session", {
    body: { plan: planKey, returnUrl, eventId },
  });

  const CHECKOUT_FAILED = "לא הצלחנו לפתוח את מסך התשלום — נסו שוב בעוד רגע";
  if (error || data?.error) throw new Error(await billingErrorMessage(error, data, CHECKOUT_FAILED));
  if (!data?.url) throw new Error(CHECKOUT_FAILED);
  return data.url;
}

/**
 * Create a Stripe Billing Portal session.
 *
 * There is no subscription to manage or cancel — purchases are one-time per
 * event (27.9). What the portal is for now is the customer's own record: the
 * receipt for what they paid, and the card on file.
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
    throw new Error(NOT_READY);
  }
  if (!supabase) {
    throw new Error(NOT_READY);
  }

  const { data, error } = await supabase.functions.invoke("create-billing-portal", {
    body: { returnUrl },
  });

  const PORTAL_FAILED = "לא הצלחנו לפתוח את החשבוניות — נסו שוב בעוד רגע";
  if (error || data?.error) throw new Error(await billingErrorMessage(error, data, PORTAL_FAILED));
  if (!data?.url) throw new Error(PORTAL_FAILED);
  return data.url;
}
