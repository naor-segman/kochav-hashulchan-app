import { useState, useCallback } from "react";
import {
  isStripeConfigured,
  createCheckoutSession,
  createBillingPortalSession,
} from "../lib/stripe.js";

export { isStripeConfigured };

// ── useBilling ─────────────────────────────────────────────────────────────────
//
// Provides upgrade and billing-portal redirect flows for the AccountScreen.
//
// checkoutTarget — null | "pro" | "enterprise" | "portal"
//   Set to the active operation while an async request is in flight.
//   Lets each button show its own loading spinner without a shared boolean.
//   Reset to null only on error (success redirects the browser away).
//
// startCheckout(planKey) — calls the Edge Function and redirects to Stripe Checkout.
//   Silently no-ops (sets error) when Stripe is not configured.
//
// openPortal() — calls the Edge Function and redirects to Stripe Billing Portal.
//   Silently no-ops (sets error) when Stripe is not configured.
// ─────────────────────────────────────────────────────────────────────────────

export function useBilling() {
  const [checkoutTarget, setCheckoutTarget] = useState(null);
  const [error,          setError]          = useState(null);

  const startCheckout = useCallback(async (planKey) => {
    setError(null);
    setCheckoutTarget(planKey);
    try {
      const returnUrl = window.location.origin + "/account";
      const url = await createCheckoutSession(planKey, returnUrl);
      window.location.href = url; // redirects away — no state cleanup needed
    } catch (err) {
      setError(err?.message ?? "שגיאה בפתיחת מסך התשלום. נסה שוב.");
      setCheckoutTarget(null);
    }
  }, []);

  const openPortal = useCallback(async () => {
    setError(null);
    setCheckoutTarget("portal");
    try {
      const returnUrl = window.location.origin + "/account";
      const url = await createBillingPortalSession(returnUrl);
      window.location.href = url;
    } catch (err) {
      setError(err?.message ?? "שגיאה בפתיחת ניהול החיוב. נסה שוב.");
      setCheckoutTarget(null);
    }
  }, []);

  return {
    checkoutTarget,
    error,
    isStripeConfigured,
    startCheckout,
    openPortal,
  };
}
