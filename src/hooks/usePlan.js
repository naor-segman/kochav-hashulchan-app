import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth.js";
import { supabase } from "../lib/supabase.js";
import { getPlanLimits } from "../admin/lib/planConfig.js";
import { planForEvent, bestPlanOnAccount, unpaidEventCount } from "../utils/entitlement.js";

// ── usePlan ───────────────────────────────────────────────────────────────────
//
// Resolves the effective plan key FOR ONE EVENT.
//
// It used to resolve it for the ACCOUNT — one row, `.limit(1)`, "does this user
// have a subscription" — and that is the bug this hook now exists to not have.
// The price is ₪690 לאירוע, so one payment unlocked every event the host would
// ever create: buy the package for your wedding and the bar mitzvah two years
// later came pre-paid. The page said per-event, the code said per-account, and
// nothing in the app could show the difference because no limit is enforced yet.
//
// USAGE
//   usePlan(ev)   → the package for THAT event. This is what a gate asks, always.
//   usePlan()     → the best package anywhere on the account. Only for the
//                   screens that genuinely have no event in scope (the account
//                   screen). Asking this at a gate re-creates the original bug.
//
// ⚠️ PASS THE EVENT OBJECT, NOT AN ID. An event has two ids: `ev.id` is minted
// client-side, is what the URL carries and what every screen holds; `ev.cloudId`
// is the real events.id and the only one a purchase can reference. Handing this
// hook `ev.id` matches no purchase, so every event reads free and the only
// symptom is a paying customer seeing the free tier.
//
// Rules:
//  - Not logged in / Supabase not configured  → "free", no network call
//  - No purchase covering the event           → "free"
//  - Any fetch error                          → "free" silently
//
// Returns { plan, limits, loading, purchases, planFor, unpaidEvents }.
//   purchases    — every live purchase row, so a screen can list them
//   planFor(ev)  — resolve another event without a second query
//   unpaidEvents(events) — how many of the host's events are still unpaid, which
//                  is what the event-creation allowance counts now
// ─────────────────────────────────────────────────────────────────────────────

async function fetchPurchases(userId) {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from("subscriptions")
      // event_id is the column this whole change is about. `expires_at` comes
      // with it because a refund revokes by setting it, and a row can still say
      // status "active" at that moment.
      .select("plan, event_id, status, expires_at, started_at, is_manually_managed")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      // No `.limit(1)`. A host with three events can hold three purchases, and
      // taking the newest one was exactly how a per-event model got flattened
      // into a per-account one.
      .order("started_at", { ascending: false });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function usePlan(ev) {
  const { user, loading: authLoading } = useAuth();
  const [purchases, setPurchases] = useState([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => {
    if (!user) {
      // Covers both "not logged in" and "auth still loading" cases.
      // When auth resolves to a user, user?.id changes and re-triggers this effect.
      setPurchases([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchPurchases(user.id).then(rows => {
      if (!cancelled) setPurchases(rows);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
    // Keyed on identity, not on the user object: Supabase hands back a new
    // object reference on every token refresh, and depending on it would
    // re-query the plan roughly every hour for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // An event argument means "this event's package". No argument means the
  // account's best, and that is only ever right where there is no event.
  const plan = ev === undefined
    ? bestPlanOnAccount(purchases)
    : planForEvent(purchases, ev);

  /* Memoised on `purchases`, not re-created every render. These end up in
     useCallback dependency arrays in App.jsx, and a fresh function identity on
     each render would rebuild every callback that depends on it — including
     startEvent, which is passed down to three screens. */
  const planFor      = useCallback((other)  => planForEvent(purchases, other), [purchases]);
  const unpaidEvents = useCallback((events) => unpaidEventCount(purchases, events), [purchases]);

  return {
    plan,
    limits:  getPlanLimits(plan),
    loading: authLoading || loading,
    purchases,
    planFor,
    unpaidEvents,
  };
}
