import { PLAN_KEYS } from "../admin/lib/planConfig.js";

/**
 * Which package an EVENT has, given what the user has bought.
 *
 * ── The rule, in one place ───────────────────────────────────────────────────
 * A purchase is one payment for one event (₪690 לאירוע). So "what plan am I on"
 * is not a question about the account any more — it is a question about a
 * wedding. Two events belonging to the same host can legitimately be on
 * different packages, and usually will be: you pay for the wedding and the bar
 * mitzvah two years later starts free again.
 *
 * This file exists because that rule was already written twice — `usePlan()`
 * resolved it from the database, and `AdminUsersScreen` re-implemented it by
 * hand next to a comment promising "the same rule usePlan() applies, so support
 * and the customer see one plan." Two copies of an entitlement rule is how
 * support ends up looking at a different answer than the customer, and it is
 * the shape of bug this repo has recorded more than any other. Both call it now.
 *
 * ── Why the CLOUD id ─────────────────────────────────────────────────────────
 * An event has two ids: `ev.id` (client-minted, in the URL, and stored inside
 * the cloud row's JSONB as payload.localId) and `ev.cloudId` (the real
 * events.id). A purchase references the CLOUD id — see the migration for why.
 * So these functions take the EVENT OBJECT, never an id string: handing them
 * `ev.id` would silently match nothing, every event would read as free, and the
 * only symptom would be a paying customer seeing the free tier.
 */

/** Best-first. A host who bought the on-site package has the ₪690 one too. */
const RANK = { free: 0, pro: 1, enterprise: 2 };

/**
 * Does this row grant anything on EVERY event of the account?
 *
 * Only an ADMIN COMP: event_id null AND is_manually_managed true. It used to be
 * event_id null alone, and that was a hole I built on 28.9 and the security
 * audit found the same day. subscriptions.event_id is ON DELETE SET NULL (so
 * deleting an event keeps the record that money moved), and the webhook wrote
 * null when it could not match the event — so "null" meant two things, and the
 * second one was exploitable: pay ₪690 once, delete that event, and the row
 * turned into an account-wide entitlement. Every event on the account, including
 * ones created years later, unlocked for the price of one.
 *
 * An orphaned purchase now grants NOTHING. It stays in the table as the record of
 * a payment, for support and refunds, and the host who deleted a paid event by
 * mistake is a support case — not an automatic unlimited plan.
 */
function isAccountWide(p) {
  return p.event_id == null && p.is_manually_managed === true;
}

/** Rows this app is allowed to treat as paid-for-right-now. */
function isLive(p, now) {
  if (!p) return false;
  if (p.status !== "active" && p.status !== "trialing") return false;
  // A refund sets expires_at to the moment of the refund, so an expired row is
  // not merely historical — it is the one case where access has been taken away
  // and the status column alone would still say "active" until a later write.
  if (p.expires_at && new Date(p.expires_at) <= now) return false;
  return true;
}

/**
 * The package for one event.
 *
 * @param {Array<{plan: string, event_id: string|null, status: string, expires_at: string|null}>} purchases
 * @param {{cloudId?: string|null}|null} ev — the EVENT OBJECT, not an id
 * @returns {string} a plan key from PLAN_KEYS — "free" when nothing applies
 */
export function planForEvent(purchases, ev) {
  const now = new Date();
  let best = "free";
  for (const p of purchases ?? []) {
    if (!isLive(p, now)) continue;
    /* Account-wide only for an admin comp — see isAccountWide. An orphaned row
       (its event deleted, or never matched) applies to nothing.

       The `!!ev?.cloudId` clause is belt and braces and I could not make it
       fail: with any row the webhook can actually write, `p.event_id` is either
       null or a uuid string, and a string never equals null or undefined, so an
       unsynced event (cloudId null) already matches nothing. A mutation removing
       the clause passes the suite; kept because it states the invariant that an
       event with no cloud identity is entitled to nothing. */
    const applies = isAccountWide(p) || (!!ev?.cloudId && p.event_id === ev.cloudId);
    if (!applies) continue;
    if (!PLAN_KEYS.includes(p.plan)) continue;   // an unknown plan grants nothing
    if (RANK[p.plan] > RANK[best]) best = p.plan;
  }
  return best;
}

/**
 * The best package anywhere on the account.
 *
 * For the places that legitimately have no event in scope — the account screen,
 * the admin user list. It is NOT what a gate should ask: a gate is always about
 * one event, and using this there would unlock every event for someone who paid
 * for one, which is the bug this whole change exists to fix.
 */
export function bestPlanOnAccount(purchases) {
  const now = new Date();
  let best = "free";
  for (const p of purchases ?? []) {
    if (!isLive(p, now)) continue;
    // An orphaned purchase is a record, not an entitlement — it must not make
    // the account screen claim a paid package that unlocks nothing.
    if (p.event_id == null && !isAccountWide(p)) continue;
    if (!PLAN_KEYS.includes(p.plan)) continue;
    if (RANK[p.plan] > RANK[best]) best = p.plan;
  }
  return best;
}

/** Has this specific event been paid for? */
export function isEventPaid(purchases, ev) {
  return planForEvent(purchases, ev) !== "free";
}

/**
 * How many of the host's events are still unpaid.
 *
 * This is what the event-creation allowance counts now, and the change is not
 * cosmetic. `free.maxEvents` is 1, and it used to be compared against
 * `events.length` — so a host who paid ₪690 for their wedding could never open
 * a second event, and a host who had one free event could never open another
 * even after paying. Under one-payment-per-event the honest reading of the free
 * tier's own "אירוע אחד" is: ONE UNPAID EVENT AT A TIME, plus every event you
 * have paid for. Pay for the wedding and the next event starts free again.
 */
export function unpaidEventCount(purchases, events) {
  return (events ?? []).filter(ev => !isEventPaid(purchases, ev)).length;
}
