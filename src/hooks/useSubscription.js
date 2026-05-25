import { useState, useEffect, useCallback } from "react";
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

  const refresh = useCallback(() => {
    if (!user) return;
    fetchSub(user.id).then(setSub);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSub(null);
      return;
    }
    setSub(undefined);
    fetchSub(user.id).then(setSub);
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
  };
}
