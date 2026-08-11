import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./useAuth.js";
import { supabase } from "../lib/supabase.js";

// ── useSubscription ────────────────────────────────────────────────────────────
//
// Returns the authenticated user's active subscription row plus derived state.
//
// subscription — undefined (loading) | null (no active sub) | object (active/trialing row)
// planKey      — "free" | "pro" | "enterprise" (defaults to "free" when no sub)
// statusKey    — "active" | "trialing" (always from DB status column when sub exists)
// isPaymentFailed — true when payment_past_due flag is set (grace period)
// isCancelling — true when expires_at is set and in the future (cancel scheduled)
// refresh()    — manually re-fetch (call after a successful checkout)
// refreshUntilPlanChanges() — bounded poll for the async Stripe webhook
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSub(userId) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("plan, status, started_at, expires_at, current_period_end, payment_past_due")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const [sub, setSub] = useState(undefined); // undefined=loading, null=none
  const refreshCountRef = useRef(0);
  const cancelPollRef    = useRef(false);

  const refresh = useCallback(() => {
    if (!user) return;
    const token = ++refreshCountRef.current;
    fetchSub(user.id).then(data => {
      if (token === refreshCountRef.current) setSub(data);
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Poll until the plan actually changes, or give up.
   *
   * Stripe's webhook is asynchronous and the customer is redirected back the
   * instant checkout completes — often before the webhook has written the
   * subscription row. A single immediate re-fetch therefore shows "תוכנית
   * חינם" to someone who has just paid, with no way to tell that it is a race
   * and not a failure.
   *
   * Bounded on purpose: ~20 seconds of widening intervals, then it stops and
   * the caller decides what to say. It never spins forever, and it stops the
   * moment the plan differs from what it was when the poll started.
   *
   * Returns a promise resolving to true if the plan changed, false if it timed
   * out — so the screen can say "התשלום התקבל, העדכון עוד לא הגיע" instead of
   * silently showing the old plan.
   */
  const refreshUntilPlanChanges = useCallback(async (previousPlan) => {
    if (!user) return false;
    const before = previousPlan ?? (sub?.plan || "free");
    const waits = [800, 1200, 2000, 3000, 4000, 4000, 5000];
    for (const wait of waits) {
      await new Promise(r => setTimeout(r, wait));
      if (cancelPollRef.current) return false;
      const token = ++refreshCountRef.current;
      const data = await fetchSub(user.id);
      if (token !== refreshCountRef.current) return false;   // a newer call won
      setSub(data);
      if ((data?.plan || "free") !== before) return true;
    }
    return false;
  }, [user?.id, sub?.plan]); // eslint-disable-line react-hooks/exhaustive-deps

  // Signing out mid-poll must not keep hitting the API for a user who is gone.
  useEffect(() => () => { cancelPollRef.current = true; }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSub(null);
      return;
    }
    let cancelled = false;
    setSub(undefined);
    fetchSub(user.id).then(data => {
      if (!cancelled) setSub(data);
    });
    return () => { cancelled = true; };
  }, [user?.id, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const planKey        = sub?.plan   || "free";
  const statusKey      = sub?.status || "active";
  const isPaymentFailed = !!sub?.payment_past_due;
  const isCancelling   = !!sub?.expires_at && new Date(sub.expires_at) > new Date();

  return {
    subscription: sub,
    planKey,
    statusKey,
    isPaymentFailed,
    isCancelling,
    refresh,
    refreshUntilPlanChanges,
  };
}
