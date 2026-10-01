-- =============================================================================
-- Migration: 20260927000000_one_time_purchase
-- Depends on: 20260524000004_stripe_columns
--
-- ONE PAYMENT PER EVENT — NOT A SUBSCRIPTION.
--
-- The decision is from 27.7 and the public pricing page has been stating it in
-- two places ("תשלום אחד לאירוע. לא מנוי." on the ₪690 card, and again in the
-- footnote under the table). The code did not agree: the only checkout path in
-- the repo created a Stripe session with `mode: "subscription"`, i.e. a
-- RECURRING charge, and everything downstream was built around that — a billing
-- portal for managing a subscription, a renewal date on the account screen, and
-- webhook handlers keyed on `customer.subscription.*` and `invoice.*` events.
--
-- Nobody could be charged (Stripe was never configured), so nothing had to be
-- refunded and no row has to be migrated — this table is empty of Stripe rows.
-- But "not a subscription" printed above a price, over code that opens a
-- subscription, is the one line on that page with real exposure, and it is
-- resolved in the direction the owner decided: the CODE changes.
--
-- WHAT A PURCHASE IS KEYED ON NOW
--   A one-time Checkout session produces no Subscription object, so
--   `stripe_subscription_id` — the column every webhook upsert used as its
--   conflict target — is always null. Two new keys replace it:
--
--   stripe_checkout_session_id  cs_… The idempotency key. Stripe can deliver
--                               checkout.session.completed more than once, and
--                               a host who double-clicks or presses Back can
--                               complete two sessions; the unique constraint is
--                               what makes the upsert safe.
--   stripe_payment_intent_id    pi_… The refund key. For a one-time payment the
--                               only lifecycle event after "paid" is a REFUND,
--                               and charge.refunded identifies the charge by
--                               payment intent, not by session.
--
-- WHAT IS NOT DONE HERE, AND MUST NOT BE ASSUMED
--   The price is per EVENT, but a purchase row is still per USER. Paying once
--   therefore unlocks the paid plan for the account, not for one event. That is
--   checklist 41/44 (per-event entitlement) and it is deliberately NOT built
--   into this migration — adding an event_id here without the enforcement that
--   goes with it would be a column nothing reads, which is how the gift-amount
--   field ended up printing ₪0 in an Excel sheet for months.
-- =============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   text UNIQUE;

COMMENT ON COLUMN public.subscriptions.stripe_checkout_session_id IS
  'Stripe cs_… Checkout Session ID of the one-time purchase. Conflict target for the webhook upsert — this is what makes a duplicated checkout.session.completed delivery idempotent.';

COMMENT ON COLUMN public.subscriptions.stripe_payment_intent_id IS
  'Stripe pi_… Payment Intent ID of the one-time purchase. Looked up by charge.refunded, the only lifecycle event a one-time payment has after it succeeds.';

CREATE INDEX IF NOT EXISTS subs_stripe_session_idx
  ON public.subscriptions (stripe_checkout_session_id);

CREATE INDEX IF NOT EXISTS subs_stripe_pi_idx
  ON public.subscriptions (stripe_payment_intent_id);

-- ── The columns the subscription model left behind ───────────────────────────
--
-- Kept, not dropped. `is_manually_managed` and `payment_past_due` are still
-- used (the admin panel comps accounts with the first, and an admin can still
-- flag a failed payment with the second), and dropping a column is the one
-- schema change that cannot be undone by re-running a migration. What they get
-- instead is a comment that says they are no longer written by any webhook, so
-- the next person does not build on them.

COMMENT ON COLUMN public.subscriptions.stripe_subscription_id IS
  'LEGACY — Stripe sub_… ID. Always null since 27.9: purchases are one-time (mode: payment) and produce no Subscription object. Kept because dropping a unique column is irreversible, and because a comped or migrated recurring contract would still land here.';

COMMENT ON COLUMN public.subscriptions.current_period_end IS
  'LEGACY — end of a billing period. Always null for a one-time purchase: there is no next period, which is the whole point. The account screen no longer renders a renewal date.';

COMMENT ON COLUMN public.subscriptions.payment_past_due IS
  'Set by an ADMIN only since 27.9. It used to be written by invoice.payment_failed / invoice.payment_succeeded; a one-time payment generates no invoices, so those handlers were removed with the subscription model.';

COMMENT ON TABLE public.subscriptions IS
  'One row per PURCHASE. Since 27.9 these are one-time payments per event (Stripe mode: payment), not subscriptions — see 20260927000000_one_time_purchase. The table name is kept because subscriptions.plan carries a CHECK constraint that the whole app and the Stripe metadata read.';
