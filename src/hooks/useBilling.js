import { useState, useCallback } from "react";
import {
  isStripeConfigured,
  createCheckoutSession,
  createBillingPortalSession,
} from "../lib/stripe.js";

// `export { isStripeConfigured }` sat here with no importer anywhere — the hook
// already hands it back in its return value below, and AccountScreen reads it
// straight from stripeConfig. (The identical-looking re-export in lib/stripe.js
// is NOT dead: this file is its consumer.)

// ── useBilling ─────────────────────────────────────────────────────────────────
//
// Provides upgrade and billing-portal redirect flows for the AccountScreen.
//
// checkoutTarget — null | "pro" | "enterprise" | "portal"
//   Set to the active operation while an async request is in flight.
//   Lets each button show its own loading spinner without a shared boolean.
//   Reset to null only on error (success redirects the browser away).
//
// startCheckout(planKey, event) — calls the Edge Function and redirects to
//   Stripe Checkout. `event` is the event being bought; a purchase unlocks one.
//   Silently no-ops (sets error) when Stripe is not configured.
//
// openPortal() — calls the Edge Function and redirects to Stripe Billing Portal.
//   Silently no-ops (sets error) when Stripe is not configured.
// ─────────────────────────────────────────────────────────────────────────────

export function useBilling() {
  const [checkoutTarget, setCheckoutTarget] = useState(null);
  const [error,          setError]          = useState(null);

  /* `event`, not just a plan. A purchase unlocks ONE event (₪690 לאירוע), so
     the checkout cannot be opened from a screen that does not know which one —
     which is why this is called from inside an event and not from /account.
     Takes the EVENT OBJECT and reads `cloudId` off it here, so no caller has to
     remember which of an event's two ids is the right one. */
  const startCheckout = useCallback(async (planKey, event) => {
    setError(null);
    setCheckoutTarget(planKey);
    try {
      /* Back to THIS event, not to /account. The host was in the middle of
         seating a wedding; returning them to a billing screen makes them find
         their way back, and the success banner belongs where the feature they
         just bought is. */
      const returnUrl = event?.id
        ? `${window.location.origin}/events/${event.id}`
        : window.location.origin + "/account";
      const url = await createCheckoutSession(planKey, returnUrl, event?.cloudId);
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
