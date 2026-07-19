-- =============================================================================
-- Migration: 20260524000004_stripe_columns
-- Depends on: 20260524000000_admin_foundation
--
-- Adds Stripe billing columns to subscriptions and profiles in preparation
-- for the payment integration phase.
--
-- STATUS: INACTIVE — columns are added now so the schema is ready when
-- the Edge Functions and billing UI are wired up in a future phase.
-- No payment logic is activated by this migration.
--
-- Column guide:
--   stripe_customer_id      — Stripe Customer object ID (cus_…)
--                             Stored on both profiles (created once at first
--                             payment intent) and subscriptions (per-sub copy).
--   stripe_subscription_id  — Stripe Subscription object ID (sub_…)
--                             Primary key for webhook upserts.
--   stripe_price_id         — Stripe Price ID (price_…) of the active plan.
--                             Used by getPlanFromStripePrice() to resolve the
--                             local plan key on subscription.updated events.
--   current_period_end      — Stripe's billing period end (unix ts → timestamptz).
--                             Used to set expires_at and to show "renews on X".
--   is_manually_managed     — When true, webhook handlers skip this row.
--                             Allows admin overrides (comped accounts, support
--                             exceptions) to survive webhook events.
--   payment_past_due        — Set true on invoice.payment_failed.
--                             Cleared on invoice.payment_succeeded.
--                             Enables a grace-period UI without revoking access.
-- =============================================================================

-- ── subscriptions table ───────────────────────────────────────────────────────

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_price_id         text,
  ADD COLUMN IF NOT EXISTS current_period_end      timestamptz,
  ADD COLUMN IF NOT EXISTS is_manually_managed     boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_past_due        boolean     NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscriptions.stripe_customer_id     IS 'Stripe cus_… ID. Populated by checkout.session.completed webhook.';
COMMENT ON COLUMN public.subscriptions.stripe_subscription_id IS 'Stripe sub_… ID. Primary lookup key for all subscription webhooks.';
COMMENT ON COLUMN public.subscriptions.stripe_price_id        IS 'Stripe price_… ID of the active plan price. Used to resolve plan key on updates.';
COMMENT ON COLUMN public.subscriptions.current_period_end     IS 'End of current billing period from Stripe. Used to set expires_at and display renewal date.';
COMMENT ON COLUMN public.subscriptions.is_manually_managed    IS 'When true, webhook handlers must not overwrite this row. Used for admin overrides.';
COMMENT ON COLUMN public.subscriptions.payment_past_due       IS 'Set true on invoice.payment_failed; cleared on invoice.payment_succeeded. Enables grace-period UI.';

-- Fast lookup by Stripe IDs for webhook handlers (service role queries)
CREATE INDEX IF NOT EXISTS subs_stripe_customer_idx
  ON public.subscriptions (stripe_customer_id);

CREATE INDEX IF NOT EXISTS subs_stripe_sub_idx
  ON public.subscriptions (stripe_subscription_id);

-- ── profiles table ────────────────────────────────────────────────────────────
--
-- stripe_customer_id on profiles stores the Stripe Customer object created at
-- first checkout. A customer is created once per user — reused across all
-- subscriptions so billing history is preserved through cancellations.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe cus_… ID. Created once at first checkout; reused for all future subscriptions.';

CREATE INDEX IF NOT EXISTS profiles_stripe_cust_idx
  ON public.profiles (stripe_customer_id);
