import { useState, useEffect } from "react";
import { useAuth } from "./useAuth.js";
import { supabase } from "../lib/supabase.js";
import { getPlanLimits } from "../admin/lib/planConfig.js";

// ── usePlan ───────────────────────────────────��───────────────────────────────
//
// Resolves the current user's effective plan key.
//
// Rules:
//  - Not logged in  → "free"
//  - Logged in, no subscription  → "free"
//  - Logged in, active/trialing subscription → subscription.plan
//  - Supabase not configured  → "free" immediately, no network call
//  - Any fetch error  → "free" silently
//
// Returns { plan, limits, loading }.
// `limits` is always the full PLAN_LIMITS entry for the current plan.
// ─���───────────────────────────────────────────────────────────────────────────

async function fetchActivePlan(userId) {
  if (!supabase) return "free";
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.plan ?? "free";
  } catch {
    return "free";
  }
}

export function usePlan() {
  const { user, loading: authLoading } = useAuth();
  const [plan,    setPlan]    = useState("free");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      // Covers both "not logged in" and "auth still loading" cases.
      // When auth resolves to a user, user?.id changes and re-triggers this effect.
      setPlan("free");
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchActivePlan(user.id).then(p => {
      if (!cancelled) setPlan(p ?? "free");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user?.id]); // re-run only when user identity changes

  return {
    plan,
    limits:  getPlanLimits(plan),
    loading: authLoading || loading,
  };
}
