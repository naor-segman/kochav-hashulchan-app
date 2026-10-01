import { bestPlanOnAccount } from "../../utils/entitlement.js";

/* "Active purchases" in the admin panel, by the CUSTOMER APP'S rule (סב39).
 *
 * The dashboard tile counted `status in (active, trialing)` and the plan cards
 * on the purchases screen counted `status === "active" && !payment_past_due`.
 * Neither is what decides whether a host actually has the package: a refunded
 * row keeps status "active" with expires_at in the past, and a purchase whose
 * event was deleted (event_id null, not an admin comp) grants nothing at all —
 * see src/utils/entitlement.js. So the panel reported paying customers that the
 * app itself treats as free, and the two screens disagreed with each other.
 *
 * There is one rule and it lives in entitlement.js. A single row run through
 * bestPlanOnAccount() answers exactly "what does THIS purchase grant right
 * now": its plan when live and attached to something, "free" otherwise. This
 * file only counts with it — it must never grow a second copy of the rule.
 *
 * A row needs plan, status, expires_at, event_id and is_manually_managed.
 * Without event_id every row reads as orphaned, so callers that could not read
 * it must not call these.
 */

/** The plan this one purchase row grants right now; "free" when nothing. */
export function planGrantedBy(row) {
  return bestPlanOnAccount([row]);
}

/** How many rows grant `plan` right now. Always 0 for "free": that is what a
 *  row granting NOTHING resolves to, so counting it would count the refunds
 *  and the orphans — and a purchase of the free tier unlocks nothing anyway. */
export function countGranting(rows, plan) {
  if (plan === "free") return 0;
  return (rows ?? []).filter(r => planGrantedBy(r) === plan).length;
}

/** How many rows grant any paid package right now. */
export function countAnyGranting(rows) {
  return (rows ?? []).filter(r => planGrantedBy(r) !== "free").length;
}
