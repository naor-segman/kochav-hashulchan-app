-- ═════════════════════════════════════════════════════════════════════════════
--  FULL DATABASE SETUP — כוכב השולחן
--
--  ⚠️  GENERATED FILE. Do not edit by hand.
--
--  This is every migration in supabase/migrations/, concatenated in filename
--  order. Regenerate it whenever a migration is added:
--
--      node qa/genSetupSql.mjs
--
--  Why it is generated: the hand-maintained version drifted SEVEN migrations
--  behind and a fresh project built from it came up with
--    • `rsvp_public_insert` / `gifts_public_insert` still WITH CHECK (true) —
--      exactly the hole 20260728_public_write_hardening was written to close,
--    • no submit_*_by_token RPCs, which the client calls — so RSVP and gift
--      submission simply failed,
--    • no collab_guests / guest_submissions / album_photos tables at all, so
--      /collab/:token and /album/:token were dead,
--    • a public_event_by_token that returned EVERY token for ANY token, so a
--      leaked album QR handed over the RSVP and invite links too.
--  A duplicate that has to be updated by hand is a duplicate that will drift.
--
--  Run this once on a fresh Supabase project (SQL editor → paste → run).
--  On an EXISTING project run the individual migrations instead.
--
--  Afterwards, grant yourself admin:
--    UPDATE public.profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL';
-- ═════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 20260524000000_admin_foundation.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Migration: 20260524000000_admin_foundation
-- Project:   Kochav Hashulchan (כוכב השולחן)
-- Phase:     Admin Foundation — Phase 1
--
-- Tables created:
--   public.profiles      — one row per auth.users entry; holds role
--   public.events        — cloud mirror of app events (payload keeps all data)
--   public.templates     — admin-managed event templates
--   public.subscriptions — future SaaS plan tracking (structure only, no billing)
--
-- RLS summary:
--   profiles      → users read/update own; admins read/update all
--   events        → users full CRUD on own; admins read/update all (no delete)
--   templates     → authenticated users read active; admins manage all
--   subscriptions → users read own; admins manage all
--
-- How to promote your account to admin (run AFTER first login):
--
--   UPDATE public.profiles
--   SET    role = 'admin', updated_at = now()
--   WHERE  email = 'YOUR_EMAIL';   -- e.g. 'you@example.com'
--
--   Run this in Supabase Dashboard → SQL Editor.
--   Only direct SQL / existing admin can promote accounts — no self-promotion.
-- =============================================================================


-- ── Helper: is_admin() ───────────────────────────────────────────────────────
--
-- Used in every RLS policy that gates on admin role.
-- SECURITY DEFINER bypasses RLS when querying profiles, preventing recursion.
-- STABLE tells the planner results won't change within a single query.

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;


-- ── profiles ─────────────────────────────────────────────────────────────────
--
-- One row per Supabase Auth user. Created automatically via trigger.
-- The `role` column is the single source of truth for admin access.

CREATE TABLE public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  role        text        NOT NULL DEFAULT 'user'
                          CHECK (role IN ('user', 'admin')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles          IS 'One profile per auth user. role drives admin access.';
COMMENT ON COLUMN public.profiles.role     IS 'user | admin — only admins or direct SQL can promote.';

-- Auto-insert a profile row whenever a user registers.
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users: read their own profile row.
CREATE POLICY "profiles: users read own"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Users: update their own profile.
-- WITH CHECK locks `role` to its current value so users cannot self-promote.
CREATE POLICY "profiles: users update own"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Admins: read every profile (needed for user-management screens).
CREATE POLICY "profiles: admins read all"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- Admins: update any profile, including role promotion.
CREATE POLICY "profiles: admins update all"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin());


-- ── events ────────────────────────────────────────────────────────────────────
--
-- Cloud mirror of the app's localStorage event objects.
-- `payload` stores the full JSON blob (tables, guests, seating, constraints…).
-- Derived columns (guest_count, table_count, seated_pct) are denormalised for
-- dashboard queries — populate them when syncing from the app.
--
-- NOTE: The customer app does NOT write here yet (Phase 1).
--       This table is reserved for future cloud-sync (Phase 3+).

CREATE TABLE public.events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,

  -- Top-level scalars (mirrored from the app event object for fast queries)
  name        text        NOT NULL DEFAULT '',
  type        text        NOT NULL DEFAULT 'חתונה',
  date        text,                          -- ISO date string ('YYYY-MM-DD'); text to match app schema
  venue       text,

  -- Full event JSON from the app — tables, guests, seating map, constraints, …
  payload     jsonb       NOT NULL DEFAULT '{}',

  -- Derived / stats columns (denormalised for admin dashboard queries)
  guest_count integer     NOT NULL DEFAULT 0,
  table_count integer     NOT NULL DEFAULT 0,
  seated_pct  numeric(5, 2) NOT NULL DEFAULT 0, -- 0.00–100.00

  -- Versioning (matches app's `version` field incremented by patchEventById)
  version     integer     NOT NULL DEFAULT 1,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.events              IS 'Cloud mirror of app localStorage events. payload holds complete JSON.';
COMMENT ON COLUMN public.events.payload      IS 'Full app event object: {tables, guests, seating, constraints, brideName, groomName, …}';
COMMENT ON COLUMN public.events.seated_pct   IS 'Percentage of guests assigned to a table (0–100).';
COMMENT ON COLUMN public.events.date         IS 'ISO date string kept as text to match the app schema exactly.';

CREATE INDEX events_user_id_idx   ON public.events (user_id);
CREATE INDEX events_updated_at_idx ON public.events (updated_at DESC);

-- RLS ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Users: full CRUD on their own events.
CREATE POLICY "events: users read own"
  ON public.events FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "events: users insert own"
  ON public.events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "events: users update own"
  ON public.events FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "events: users delete own"
  ON public.events FOR DELETE
  USING (user_id = auth.uid());

-- Admins: read and update all events.
-- No admin DELETE policy — preserve audit trail; hard deletes require SQL.
CREATE POLICY "events: admins read all"
  ON public.events FOR SELECT
  USING (public.is_admin());

CREATE POLICY "events: admins update all"
  ON public.events FOR UPDATE
  USING (public.is_admin());


-- ── templates ─────────────────────────────────────────────────────────────────
--
-- Admin-managed event templates (seed table layouts, default constraints, etc.).
-- Future use: dashboard "Start from template" CTA.
-- `payload` structure mirrors the app event payload subset used for seeding.

CREATE TABLE public.templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  type        text        NOT NULL DEFAULT 'חתונה',  -- event type this template targets
  description text,
  payload     jsonb       NOT NULL DEFAULT '{}',    -- seed data: tables[], default_constraints[], …
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.templates           IS 'Admin-managed event templates for future "start from template" feature.';
COMMENT ON COLUMN public.templates.payload   IS 'Seed payload: {tables: [], default_constraints: [], …}';

-- RLS ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active templates.
CREATE POLICY "templates: authenticated read active"
  ON public.templates FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

-- Admins: full management (insert / update / delete).
CREATE POLICY "templates: admins manage"
  ON public.templates FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── subscriptions ─────────────────────────────────────────────────────────────
--
-- Future SaaS plan tracking. Structure only — no payment integration in Phase 1.
-- Plans: free (default) | pro | enterprise
-- Status lifecycle: trialing → active → cancelled | expired

CREATE TABLE public.subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  plan        text        NOT NULL DEFAULT 'free'
                          CHECK (plan IN ('free', 'pro', 'enterprise')),
  status      text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'trialing', 'cancelled', 'expired')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                          -- null = no expiry (lifetime / manual management)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.subscriptions             IS 'SaaS plan per user. No payment logic yet — managed manually or via future billing webhook.';
COMMENT ON COLUMN public.subscriptions.expires_at  IS 'null = no expiry. Set for fixed-term or trial plans.';

CREATE INDEX subscriptions_user_id_idx ON public.subscriptions (user_id);

-- RLS ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users: read their own subscription row.
CREATE POLICY "subscriptions: users read own"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- Admins: full management (read, insert, update, delete).
-- Write access is admin-only in Phase 1; future: billing webhook via service role.
CREATE POLICY "subscriptions: admins manage"
  ON public.subscriptions FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());


-- ── Reminder: promote to admin ───────────────────────────────────────────────
--
-- After running this migration and logging in at /admin/login for the first
-- time, your profile row will be created automatically by the trigger above.
-- Then open Supabase Dashboard → SQL Editor and run:
--
--   UPDATE public.profiles
--   SET    role = 'admin', updated_at = now()
--   WHERE  email = 'YOUR_EMAIL';   -- e.g. 'you@example.com'
--
-- You only need to do this once. All subsequent logins will detect admin role.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260524000001_templates_add_icon_sort_order.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Migration: 20260524000001_templates_add_icon_sort_order
-- Depends on: 20260524000000_admin_foundation
--
-- Adds two columns to public.templates required by the admin templates screen:
--   icon       — emoji or short text symbol shown in UI (nullable)
--   sort_order — controls display order in future customer-facing template picker
-- =============================================================================

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS icon       text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.templates.icon       IS 'Short symbol shown in the UI. The admin form treats it as optional text; the product itself uses drawn SectionMark icons, not emoji.';
COMMENT ON COLUMN public.templates.sort_order IS 'Ascending display order for template pickers. Lower = earlier.';

-- Index so ORDER BY sort_order, created_at is efficient even on large template sets.
CREATE INDEX IF NOT EXISTS templates_sort_order_idx
  ON public.templates (sort_order ASC, created_at ASC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260524000002_app_settings.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Migration: 20260524000002_app_settings
-- Depends on: 20260524000000_admin_foundation (is_admin() must exist)
--
-- Single-row platform configuration table.
-- The settings screen will show a "not configured" notice until this migration
-- is run. After running it, the admin settings form becomes fully functional.
--
-- Single-row pattern: one fixed-UUID row holds all config as structured columns
-- + two JSONB columns for extensible event_defaults and feature_flags.
-- =============================================================================

CREATE TABLE public.app_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Product identity ────────────────────────────────────────────────────────
  product_name   text        NOT NULL DEFAULT 'כוכב השולחן',
  support_email  text,

  -- ── Event creation defaults ──────────────────────────────────────────────────
  -- { table_capacity: 8, guest_count: 100, event_type: "חתונה" }
  event_defaults jsonb       NOT NULL DEFAULT '{}',

  -- ── Feature flags ────────────────────────────────────────────────────────────
  -- { cloud_sync: false, templates_picker: false, ai_seating: false, multi_user: false }
  feature_flags  jsonb       NOT NULL DEFAULT '{}',

  -- ── Internal notes ───────────────────────────────────────────────────────────
  system_notes   text,

  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.app_settings                IS 'Single-row platform config. Use SETTINGS_ROW_ID for upsert.';
COMMENT ON COLUMN public.app_settings.event_defaults IS 'Defaults pre-filled when customers create a new event.';
COMMENT ON COLUMN public.app_settings.feature_flags  IS 'Boolean flags for unreleased features. All default false.';

-- RLS: admin-only for all operations.
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings: admins only"
  ON public.app_settings FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed the single settings row with the fixed ID the admin screen uses.
-- The ID is intentionally recognisable as a singleton sentinel.
INSERT INTO public.app_settings (id, product_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'כוכב השולחן')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260524000003_templates_public_read.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- Migration: 20260524000003_templates_public_read
-- Depends on: 20260524000000_admin_foundation
--
-- Allows unauthenticated (anon role) customers to read active templates so
-- the create-event template picker works without requiring login.
--
-- The existing "templates: authenticated read active" policy already covers
-- logged-in users. This policy covers the anon role only.
-- =============================================================================

CREATE POLICY "templates: anon read active"
  ON public.templates FOR SELECT
  TO anon
  USING (is_active = true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260524000004_stripe_columns.sql
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260716000000_public_pages.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Add public token columns to the events table.
-- Each token is a stable UUID used as a public URL key for one page type.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS rsvp_token    text,
  ADD COLUMN IF NOT EXISTS invite_token  text,
  ADD COLUMN IF NOT EXISTS gift_token    text,
  ADD COLUMN IF NOT EXISTS hostess_token text;

-- Unique constraint so two events can't share the same token
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_rsvp_token    ON public.events (rsvp_token) WHERE rsvp_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_invite_token  ON public.events (invite_token) WHERE invite_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_gift_token    ON public.events (gift_token) WHERE gift_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_hostess_token ON public.events (hostess_token) WHERE hostess_token IS NOT NULL;

-- ── RSVP responses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rsvp_responses (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guest_name   text        NOT NULL,
  phone        text,
  attending    boolean     NOT NULL,
  guests_count integer     NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rsvp_responses ENABLE ROW LEVEL SECURITY;

-- Anyone can submit an RSVP (public form — no auth required)
CREATE POLICY "rsvp_public_insert" ON public.rsvp_responses
  FOR INSERT WITH CHECK (true);

-- Only the event owner can read RSVPs for their events
CREATE POLICY "rsvp_owner_select" ON public.rsvp_responses
  FOR SELECT USING (
    event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid())
  );

-- ── Gift transactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gifts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  donor_name            text        NOT NULL,
  amount                integer     NOT NULL,  -- ILS in agorot (÷100 to display)
  message               text,
  stripe_payment_intent text,
  paid                  boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a gift (public gift form — Stripe webhook marks paid=true later)
CREATE POLICY "gifts_public_insert" ON public.gifts
  FOR INSERT WITH CHECK (true);

-- Paid gifts are visible to everyone (gift wall)
CREATE POLICY "gifts_wall_select" ON public.gifts
  FOR SELECT USING (paid = true);

-- Event owner can see all gifts (paid and pending) for their events
CREATE POLICY "gifts_owner_select" ON public.gifts
  FOR SELECT USING (
    event_id IN (SELECT id FROM public.events WHERE user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260719000000_public_pages_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Public-pages security hardening
-- Applies the DB-level constraints identified in the security review.
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Narrow public event SELECT to token-holder only ────────────────────────
-- CRITICAL: The prior migration has no public SELECT on events, so all public
-- pages currently show "link expired" in production. This policy lets anonymous
-- callers read minimal event metadata via the correct token column only.
-- The fetchEventByToken() client now SELECTs only named columns, so no other
-- private columns are exposed even if the policy matches a row.

CREATE POLICY "events: public rsvp token read"
  ON public.events FOR SELECT
  TO anon
  USING (rsvp_token IS NOT NULL AND rsvp_token::text = current_setting('request.jwt.claims', true)::json->>'sub'
         OR true);  -- TODO: replace with per-token column check once column type is uuid

-- Simpler approach until token columns are uuid type:
-- Match the event where the token column equals the value in the query parameter.
-- Because fetchEventByToken filters .eq(column, token), Supabase RLS only needs
-- to permit the row — the column equality is the security boundary.

DROP POLICY IF EXISTS "events: public rsvp token read" ON public.events;

CREATE POLICY "events: public token read"
  ON public.events FOR SELECT
  TO anon
  USING (
    rsvp_token    IS NOT NULL OR
    invite_token  IS NOT NULL OR
    gift_token    IS NOT NULL OR
    hostess_token IS NOT NULL
  );

-- ── 2. Length constraints on rsvp_responses ───────────────────────────────────

ALTER TABLE public.rsvp_responses
  ADD CONSTRAINT IF NOT EXISTS ck_rsvp_guest_name_nonempty
    CHECK (char_length(guest_name) > 0),
  ADD CONSTRAINT IF NOT EXISTS ck_rsvp_guest_name_len
    CHECK (char_length(guest_name) <= 200),
  ADD CONSTRAINT IF NOT EXISTS ck_rsvp_phone_len
    CHECK (phone IS NULL OR char_length(phone) <= 20),
  ADD CONSTRAINT IF NOT EXISTS ck_rsvp_guests_count_range
    CHECK (guests_count >= 0 AND guests_count <= 50);

-- ── 3. Length and amount constraints on gifts ─────────────────────────────────

ALTER TABLE public.gifts
  ADD CONSTRAINT IF NOT EXISTS ck_gift_donor_name_nonempty
    CHECK (char_length(donor_name) > 0),
  ADD CONSTRAINT IF NOT EXISTS ck_gift_donor_name_len
    CHECK (char_length(donor_name) <= 200),
  ADD CONSTRAINT IF NOT EXISTS ck_gift_message_len
    CHECK (message IS NULL OR char_length(message) <= 500),
  ADD CONSTRAINT IF NOT EXISTS ck_gift_amount_range
    CHECK (amount >= 5000 AND amount <= 10000000);  -- ₪50 min, ₪100,000 max

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260721000000_public_pages_v2.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Public pages v2 — fix broken column selection + close token enumeration hole
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Fixes two production issues:
--   1. fetchEventByToken selected columns (bride_name, groom_name, ...) that do
--      not exist on the events table — they live inside payload JSONB — so every
--      public page (RSVP / invite / gift / hostess) failed with a 400 and showed
--      "link expired".
--   2. The "events: public token read" policy allowed any anonymous caller to
--      SELECT every tokenized event row (names, dates, all four token UUIDs).
--
-- Approach: replace the broad anon SELECT policy with SECURITY DEFINER
-- functions that require the caller to present a valid token and return only
-- the minimal fields each page needs. RLS on events stays owner-only for
-- normal table access.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Remove the broad anon SELECT policy ────────────────────────────────────

DROP POLICY IF EXISTS "events: public token read" ON public.events;

-- ── 2. Public event metadata by token (RSVP / invite / gift / hostess pages) ──

CREATE OR REPLACE FUNCTION public.public_event_by_token(token_type text, token_value text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',                e.id,
    'name',              e.name,
    'type',              e.type,
    'date',              e.date,
    'venue',             e.venue,
    'bride_name',        e.payload->>'brideName',
    'groom_name',        e.payload->>'groomName',
    'celebrant_name',    e.payload->>'celebrantName',
    'organization_name', e.payload->>'organizationName',
    'contact_name',      e.payload->>'contactName',
    'owner_name',        e.payload->>'ownerName',
    'bit_phone',         e.payload->>'giftBitPhone',
    'paybox_link',       e.payload->>'giftPayboxLink'
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND CASE token_type
          WHEN 'rsvp'    THEN e.rsvp_token    = token_value
          WHEN 'invite'  THEN e.invite_token  = token_value
          WHEN 'gift'    THEN e.gift_token    = token_value
          WHEN 'hostess' THEN e.hostess_token = token_value
          ELSE false
        END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_event_by_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_event_by_token(text, text) TO anon, authenticated;

-- ── 3. Hostess data by token (guest list + tables + seating, no phones) ───────

CREATE OR REPLACE FUNCTION public.hostess_data_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',    e.id,
    'name',  e.name,
    'guests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',    g->>'id',
        'name',  g->>'name',
        'count', COALESCE((g->>'count')::int, 1)
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
    ), '[]'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',   t->>'id',
        'name', t->>'name'
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'tables', '[]'::jsonb)) t
    ), '[]'::jsonb),
    'seating', COALESCE(e.payload->'seating', '{}'::jsonb)
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.hostess_data_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_data_by_token(text) TO anon, authenticated;

-- ── 4. Gift wall by token (blessings only — no amounts, no paid status) ───────
-- The public wall shows every blessing regardless of payment state; payments
-- happen out-of-band via bit/PayBox until a licensed processor is integrated.

CREATE OR REPLACE FUNCTION public.gift_wall_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',         g.id,
      'donor_name', g.donor_name,
      'message',    g.message,
      'created_at', g.created_at
    ) ORDER BY g.created_at DESC)
    FROM public.gifts g
    WHERE g.event_id = e.id
  ), '[]'::jsonb)
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.gift_token = token_value
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.gift_wall_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.gift_wall_by_token(text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260722000000_event_site.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Event Site — expose the auto-built guest site (payload.eventSite) to the
-- public token fetch. Run once in Supabase SQL Editor.
-- Adds the 'site' key to public_event_by_token so the /invite/:token event site
-- can render schedule, location, FAQ, theme, cover photo, etc.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_event_by_token(token_type text, token_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
    -- Only serve the site once the host has published it (enabled=true), so an
    -- unpublished/unpublished-again draft is never delivered to guests.
    'site', CASE WHEN COALESCE((e.payload->'eventSite'->>'enabled')::boolean, false)
                 THEN e.payload->'eventSite' ELSE NULL END,
    -- sibling public tokens so the event site can link to RSVP / gift pages.
    -- hostess_token is deliberately NOT exposed: it unlocks the full guest list
    -- and seating map, and the invite link is shared with every guest.
    'rsvp_token', e.rsvp_token, 'gift_token', e.gift_token)
  FROM public.events e
  WHERE token_value IS NOT NULL AND char_length(token_value) >= 8
    AND CASE token_type
      WHEN 'rsvp'    THEN e.rsvp_token    = token_value
      WHEN 'invite'  THEN e.invite_token  = token_value
      WHEN 'gift'    THEN e.gift_token    = token_value
      WHEN 'hostess' THEN e.hostess_token = token_value
      ELSE false END
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.public_event_by_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_event_by_token(text, text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260723000000_rsvp_round2.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- RSVP round 2 — run once in Supabase SQL Editor.
--   1. Expose invite_token via public_event_by_token so the RSVP/gift pages can
--      link back to the event site.
--   2. Add a `status` column to rsvp_responses to support a third "maybe" (אולי)
--      answer alongside the existing yes/no boolean.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Function: add invite_token to the returned object.
CREATE OR REPLACE FUNCTION public.public_event_by_token(token_type text, token_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
    'site', CASE WHEN COALESCE((e.payload->'eventSite'->>'enabled')::boolean, false)
                 THEN e.payload->'eventSite' ELSE NULL END,
    'rsvp_token', e.rsvp_token, 'gift_token', e.gift_token, 'invite_token', e.invite_token)
  FROM public.events e
  WHERE token_value IS NOT NULL AND char_length(token_value) >= 8
    AND CASE token_type
      WHEN 'rsvp'    THEN e.rsvp_token    = token_value
      WHEN 'invite'  THEN e.invite_token  = token_value
      WHEN 'gift'    THEN e.gift_token    = token_value
      WHEN 'hostess' THEN e.hostess_token = token_value
      ELSE false END
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.public_event_by_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_event_by_token(text, text) TO anon, authenticated;

-- 2. rsvp_responses.status — 'yes' | 'no' | 'maybe' (nullable; old rows derive
--    from the attending boolean).
ALTER TABLE public.rsvp_responses
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IS NULL OR status IN ('yes', 'no', 'maybe'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260723000001_companions.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Guest companions (#8) ──────────────────────────────────────────────────
-- Store the names of the people coming with a guest, collected at RSVP time,
-- so every chair shows a name in seating / hostess / export.
-- Idempotent — safe to run more than once.

-- 1. RSVP responses carry the companion names the guest typed.
ALTER TABLE public.rsvp_responses
  ADD COLUMN IF NOT EXISTS companions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. The hostess lookup returns companions so the door team sees every name.
CREATE OR REPLACE FUNCTION public.hostess_data_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',    e.id,
    'name',  e.name,
    'guests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',    g->>'id',
        'name',  g->>'name',
        'count', COALESCE((g->>'count')::int, 1),
        'companions', COALESCE(g->'companions', '[]'::jsonb)
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
    ), '[]'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',   t->>'id',
        'name', t->>'name'
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'tables', '[]'::jsonb)) t
    ), '[]'::jsonb),
    'seating', COALESCE(e.payload->'seating', '{}'::jsonb)
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.hostess_data_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_data_by_token(text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260723000002_collab_guests.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Collaborative guest list (shareable) ───────────────────────────────────
-- A host shares a link; family members add guests through a clean web form
-- with dropdowns (no typos), each submission saved to the cloud. The host then
-- reviews and imports them into the event's guest list. Idempotent.

-- 1. Public token for the collaborative page.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS collab_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_collab_token
  ON public.events (collab_token) WHERE collab_token IS NOT NULL;

-- 2. Submissions table — one row per guest a family member adds.
CREATE TABLE IF NOT EXISTS public.guest_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
  phone         text CHECK (phone IS NULL OR char_length(phone) <= 20),
  side          text CHECK (side IS NULL OR char_length(side) <= 20),
  guest_group   text CHECK (guest_group IS NULL OR char_length(guest_group) <= 60),
  guests_count  int  NOT NULL DEFAULT 1 CHECK (guests_count BETWEEN 1 AND 50),
  submitted_by  text CHECK (submitted_by IS NULL OR char_length(submitted_by) <= 80),
  imported      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_submissions_event
  ON public.guest_submissions (event_id, created_at DESC);

ALTER TABLE public.guest_submissions ENABLE ROW LEVEL SECURITY;

-- Owner of the event can read + update (mark imported) its submissions.
DROP POLICY IF EXISTS "gs_owner_select" ON public.guest_submissions;
CREATE POLICY "gs_owner_select" ON public.guest_submissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "gs_owner_update" ON public.guest_submissions;
CREATE POLICY "gs_owner_update" ON public.guest_submissions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  )
  -- WITH CHECK on the NEW row too, otherwise an owner could re-point a row's
  -- event_id at an event they don't own (cross-event injection).
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  );

-- 3. Minimal event info for the public collab form (name + side labels source).
CREATE OR REPLACE FUNCTION public.collab_event_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',          e.id,
    'name',        e.name,
    'type',        e.type,
    'bride_name',  e.payload->>'brideName',
    'groom_name',  e.payload->>'groomName',
    'couple_type', e.payload->>'coupleType',
    'side_labels', e.payload->'sideLabels'
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.collab_token = token_value
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.collab_event_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_event_by_token(text) TO anon, authenticated;

-- 4. Anonymous insert of one guest submission, keyed by the collab token.
CREATE OR REPLACE FUNCTION public.submit_guest_by_token(token_value text, guest jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value AND char_length(token_value) >= 8 LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF char_length(trim(coalesce(guest->>'name',''))) = 0 THEN RAISE EXCEPTION 'name required'; END IF;
  -- The collab link is semi-public (forwarded around a family); cap total
  -- submissions per event so a leaked link can't flood the review queue.
  IF (SELECT count(*) FROM public.guest_submissions WHERE event_id = ev_id) >= 5000 THEN
    RAISE EXCEPTION 'submission limit reached';
  END IF;
  INSERT INTO public.guest_submissions (event_id, name, phone, side, guest_group, guests_count, submitted_by)
  VALUES (
    ev_id,
    left(trim(guest->>'name'), 120),
    nullif(left(trim(coalesce(guest->>'phone','')), 20), ''),
    nullif(left(guest->>'side', 20), ''),
    nullif(left(guest->>'group', 60), ''),
    greatest(1, least(50, coalesce((guest->>'count')::int, 1))),
    nullif(left(trim(coalesce(guest->>'submittedBy','')), 80), '')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_guest_by_token(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_guest_by_token(text, jsonb) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260724000000_collab_live_table.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Live collaborative guest table ─────────────────────────────────────────
-- A shared, real-time table per event. Anyone with the collab link can read the
-- whole list and add/edit/delete rows live; the owner's app keeps this table and
-- events.payload.guests in sync BOTH ways, keyed by a shared row id.
--
-- Security posture (intentional): the collab link is "fully open" by product
-- design, so anon may READ every row of a collab-enabled event (needed for
-- Realtime) and WRITE via token-validated SECURITY DEFINER functions. The
-- event_id is an unguessable UUID handed out only through the token, so it acts
-- as the capability. Idempotent.

-- 1. The table. `id` is the SAME uuid used for the guest row in the app, so a
--    row here and its guest-list counterpart stay linked for two-way sync.
CREATE TABLE IF NOT EXISTS public.collab_guests (
  id            uuid PRIMARY KEY,
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name          text CHECK (name IS NULL OR char_length(name) <= 120),
  phone         text CHECK (phone IS NULL OR char_length(phone) <= 20),
  side          text CHECK (side IS NULL OR char_length(side) <= 20),
  guest_group   text CHECK (guest_group IS NULL OR char_length(guest_group) <= 60),
  guests_count  int  NOT NULL DEFAULT 1 CHECK (guests_count BETWEEN 1 AND 50),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text CHECK (updated_by IS NULL OR char_length(updated_by) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_collab_guests_event
  ON public.collab_guests (event_id, updated_at DESC);

ALTER TABLE public.collab_guests ENABLE ROW LEVEL SECURITY;

-- 2. Owner (authenticated) has full access to their events' rows — this is what
--    the app's two-way sync engine uses to push app→table changes.
DROP POLICY IF EXISTS "cg_owner_all" ON public.collab_guests;
CREATE POLICY "cg_owner_all" ON public.collab_guests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  );

-- 3. Anon may READ rows of any collab-enabled event (required so Realtime can
--    deliver live changes to family members). Anon writes go only through the
--    token-validated functions below — never a direct table grant.
DROP POLICY IF EXISTS "cg_anon_select" ON public.collab_guests;
CREATE POLICY "cg_anon_select" ON public.collab_guests
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.collab_token IS NOT NULL)
  );

GRANT SELECT ON public.collab_guests TO anon;

-- 4. Add the table to the Realtime publication (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'collab_guests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_guests;
  END IF;
END $$;

-- Realtime sends full row data on UPDATE/DELETE only with REPLICA IDENTITY FULL.
ALTER TABLE public.collab_guests REPLICA IDENTITY FULL;

-- 5. Anon read of the whole list for an event, by token (initial load).
CREATE OR REPLACE FUNCTION public.collab_list_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           g.id,
    'name',         g.name,
    'phone',        g.phone,
    'side',         g.side,
    'guest_group',  g.guest_group,
    'guests_count', g.guests_count,
    'updated_at',   g.updated_at,
    'updated_by',   g.updated_by
  ) ORDER BY g.updated_at DESC), '[]'::jsonb)
  FROM public.collab_guests g
  JOIN public.events e ON e.id = g.event_id
  WHERE e.collab_token = token_value
    AND char_length(token_value) >= 8;
$$;
REVOKE ALL ON FUNCTION public.collab_list_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text) TO anon, authenticated;

-- 6. Anon insert/update of one row, keyed by the collab token. The caller passes
--    a client-generated uuid so the row links to the app's guest row.
CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid; row_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value AND char_length(token_value) >= 8 LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  row_id := (row_data->>'id')::uuid;
  IF row_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;

  -- Cap total rows per event so a leaked link can't flood the table.
  IF NOT EXISTS (SELECT 1 FROM public.collab_guests WHERE id = row_id AND event_id = ev_id)
     AND (SELECT count(*) FROM public.collab_guests WHERE event_id = ev_id) >= 5000 THEN
    RAISE EXCEPTION 'row limit reached';
  END IF;

  INSERT INTO public.collab_guests (id, event_id, name, phone, side, guest_group, guests_count, updated_by, updated_at)
  VALUES (
    row_id, ev_id,
    nullif(left(trim(coalesce(row_data->>'name','')), 120), ''),
    nullif(left(trim(coalesce(row_data->>'phone','')), 20), ''),
    nullif(left(row_data->>'side', 20), ''),
    nullif(left(row_data->>'guest_group', 60), ''),
    greatest(1, least(50, coalesce((row_data->>'guests_count')::int, 1))),
    nullif(left(trim(coalesce(row_data->>'updated_by','')), 80), ''),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name         = excluded.name,
    phone        = excluded.phone,
    side         = excluded.side,
    guest_group  = excluded.guest_group,
    guests_count = excluded.guests_count,
    updated_by   = excluded.updated_by,
    updated_at   = now()
  WHERE public.collab_guests.event_id = ev_id;  -- never move a row across events
END;
$$;
REVOKE ALL ON FUNCTION public.collab_upsert_by_token(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_upsert_by_token(text, jsonb) TO anon, authenticated;

-- 7. Anon delete of one row, keyed by the collab token.
CREATE OR REPLACE FUNCTION public.collab_delete_by_token(token_value text, row_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value AND char_length(token_value) >= 8 LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  DELETE FROM public.collab_guests WHERE id = row_id AND event_id = ev_id;
END;
$$;
REVOKE ALL ON FUNCTION public.collab_delete_by_token(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_delete_by_token(text, uuid) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260724000001_collab_security.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Close the anon read leak on collab_guests ──────────────────────────────
-- The previous migration granted anon direct SELECT so Realtime could deliver
-- live changes. But a direct table grant lets any anonymous client run an
-- UNFILTERED select and enumerate every collab-enabled event's guest names AND
-- phone numbers — the token/event capability is bypassed. Phones are
-- deliberately withheld elsewhere (hostess/RSVP RPCs), so this is a real leak.
--
-- Fix: anon gets NO direct table access. The public family page reads/writes
-- ONLY through the token-validated SECURITY DEFINER functions (collab_list /
-- collab_upsert / collab_delete _by_token), which scope everything to one event
-- by its collab_token. The app polls collab_list_by_token for live updates.
-- The owner (authenticated) keeps full access via the cg_owner_all RLS policy.
-- Idempotent.

DROP POLICY IF EXISTS "cg_anon_select" ON public.collab_guests;

REVOKE ALL ON public.collab_guests FROM anon;

-- Owner access is RLS-guarded (cg_owner_all); ensure the role has the grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collab_guests TO authenticated;

-- The SECURITY DEFINER token functions remain the only anon path in.
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text)          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collab_upsert_by_token(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.collab_delete_by_token(text, uuid)  TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260725000000_collab_companions.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Companion names on the shared collaborative table ──────────────────────
-- Let family/team members type the names of the people coming WITH a guest
-- (when guests_count > 1), just like the RSVP flow. The names sync into the
-- owner's guest list (guest.companions) so every chair shows a name in
-- seating / hostess / export.
--
-- Mirrors 20260723000001 (guest companions): a jsonb array of strings.
-- Idempotent — safe to run more than once.

-- 1. The column. Default '[]' so existing rows and old clients keep working.
ALTER TABLE public.collab_guests
  ADD COLUMN IF NOT EXISTS companions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. The public list RPC now returns companions for every row.
CREATE OR REPLACE FUNCTION public.collab_list_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           g.id,
    'name',         g.name,
    'phone',        g.phone,
    'side',         g.side,
    'guest_group',  g.guest_group,
    'guests_count', g.guests_count,
    'companions',   g.companions,
    'updated_at',   g.updated_at,
    'updated_by',   g.updated_by
  ) ORDER BY g.updated_at DESC), '[]'::jsonb)
  FROM public.collab_guests g
  JOIN public.events e ON e.id = g.event_id
  WHERE e.collab_token = token_value
    AND char_length(token_value) >= 8;
$$;
REVOKE ALL ON FUNCTION public.collab_list_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text) TO anon, authenticated;

-- 3. The upsert RPC now accepts + sanitizes companions. Positions are preserved
--    (so "מלווה 2" stays the second seat); each name is trimmed to 80 chars and
--    the array is capped at 49 entries (max extra seats for count ≤ 50).
CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid; row_id uuid; comp jsonb;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value AND char_length(token_value) >= 8 LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  row_id := (row_data->>'id')::uuid;
  IF row_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;

  -- Cap total rows per event so a leaked link can't flood the table.
  IF NOT EXISTS (SELECT 1 FROM public.collab_guests WHERE id = row_id AND event_id = ev_id)
     AND (SELECT count(*) FROM public.collab_guests WHERE event_id = ev_id) >= 5000 THEN
    RAISE EXCEPTION 'row limit reached';
  END IF;

  -- Normalize companions to a bounded jsonb array of ≤80-char strings, in order.
  comp := (
    SELECT COALESCE(jsonb_agg(left(COALESCE(elem, ''), 80) ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(row_data->'companions') = 'array'
           THEN row_data->'companions' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS a(elem, ord)
    WHERE ord <= 49
  );

  INSERT INTO public.collab_guests (id, event_id, name, phone, side, guest_group, guests_count, companions, updated_by, updated_at)
  VALUES (
    row_id, ev_id,
    nullif(left(trim(coalesce(row_data->>'name','')), 120), ''),
    nullif(left(trim(coalesce(row_data->>'phone','')), 20), ''),
    nullif(left(row_data->>'side', 20), ''),
    nullif(left(row_data->>'guest_group', 60), ''),
    greatest(1, least(50, coalesce((row_data->>'guests_count')::int, 1))),
    comp,
    nullif(left(trim(coalesce(row_data->>'updated_by','')), 80), ''),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name         = excluded.name,
    phone        = excluded.phone,
    side         = excluded.side,
    guest_group  = excluded.guest_group,
    guests_count = excluded.guests_count,
    companions   = excluded.companions,
    updated_by   = excluded.updated_by,
    updated_at   = now()
  WHERE public.collab_guests.event_id = ev_id;  -- never move a row across events
END;
$$;
REVOKE ALL ON FUNCTION public.collab_upsert_by_token(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_upsert_by_token(text, jsonb) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260727000000_rsvp_shuttle.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Shuttle self-registration on the RSVP form ─────────────────────────────
-- Guests can already see the shuttle list on the event site, but the host had
-- no way to know who intends to board which one — they were counting heads by
-- WhatsApp. Rather than a separate public write path (new table, new policy,
-- new token), the choice rides along on the RSVP the guest is already filling
-- in: one form, one submission, one place for the host to read it.
--
-- shuttle_id holds the client-side shuttle id from eventSite.shuttles[].id.
-- It is intentionally free-form text and NOT a foreign key: shuttles live in
-- the event's JSON payload, not in a table, and a host who deletes a shuttle
-- must not cascade-delete their guests' RSVPs. A stale id simply stops
-- resolving to a name in the UI.
--
-- Idempotent — safe to run more than once.

ALTER TABLE public.rsvp_responses
  ADD COLUMN IF NOT EXISTS shuttle_id text;

COMMENT ON COLUMN public.rsvp_responses.shuttle_id IS
  'Optional eventSite.shuttles[].id the guest chose to board. Free-form: shuttles are stored in the event payload, not a table.';

-- Hosts read their own event's responses; the existing RLS policies on
-- rsvp_responses already scope by event ownership, so the new column needs no
-- policy of its own. Anonymous inserts likewise already go through the same
-- insert policy — it grants the row, not a column list.

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260727000001_event_album.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Shared event album ─────────────────────────────────────────────────────
-- Guests and the photographer upload to one place, and the couple gets every
-- picture from the night instead of chasing them across WhatsApp groups.
--
-- Storage rather than the event payload: photos are the one thing that cannot
-- live in the JSON blob the rest of the event syncs as. A single phone photo
-- base64'd is ~2MB; a few hundred would make every save unusable.
--
-- ACCESS MODEL — the important part.
-- Anonymous access goes through SECURITY DEFINER functions, never through RLS
-- policies that read `public.events`. That table has no anon SELECT policy (it
-- was deliberately removed in 20260721000000_public_pages_v2), so a policy of
-- the form `EXISTS (SELECT 1 FROM events …)` evaluated as `anon` matches
-- nothing and would reject every guest upload. The rest of this codebase
-- already routes public reads through definer RPCs for the same reason.
--
-- Equally, `album_photos` is never directly readable by anon: the rows carry
-- `album_token`, and `SELECT … USING (true)` would let anyone enumerate every
-- event's token — which in turn unlocks public_event_by_token and the sibling
-- rsvp/gift/invite tokens. Reads go through a function that takes the token
-- and returns only that event's photos, without the token column.
--
-- Idempotent — safe to run more than once.

-- 1. Bucket. Public read; 10MB per object, which is a generous phone photo
--    after the client-side downscale and a hard stop on someone posting video.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-album', 'event-album', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Photo index. The file lives in storage; this row is what the gallery
--    reads, so listing never depends on a storage LIST call.
create table if not exists public.album_photos (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  album_token  text not null,
  storage_path text not null unique,
  uploader     text,
  created_at   timestamptz not null default now()
);

create index if not exists album_photos_event_idx
  on public.album_photos (event_id, created_at desc);

alter table public.album_photos enable row level security;

-- 3. No anon policies at all. Owners get their own event's rows directly;
--    everyone else goes through the functions below.
drop policy if exists album_photos_public_insert on public.album_photos;
drop policy if exists album_photos_public_select on public.album_photos;

drop policy if exists album_photos_owner_select on public.album_photos;
create policy album_photos_owner_select
  on public.album_photos for select to authenticated
  using (exists (select 1 from public.events e
                 where e.id = album_photos.event_id and e.user_id = auth.uid()));

drop policy if exists album_photos_owner_delete on public.album_photos;
create policy album_photos_owner_delete
  on public.album_photos for delete to authenticated
  using (exists (select 1 from public.events e
                 where e.id = album_photos.event_id and e.user_id = auth.uid()));

-- 4. Resolve a token to its event. Definer so it can read `events`.
create or replace function public.album_event_id(token_value text)
returns uuid language sql stable security definer set search_path = public as $$
  select e.id from public.events e
  where token_value is not null
    and char_length(token_value) >= 8
    and e.payload ->> 'albumToken' = token_value
  limit 1;
$$;

-- 5. Public list — only this event's photos, and never the token column.
create or replace function public.album_list_by_token(token_value text)
returns table (id uuid, storage_path text, uploader text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.storage_path, p.uploader, p.created_at
  from public.album_photos p
  where p.event_id = public.album_event_id(token_value)
  order by p.created_at desc
  limit 3000;
$$;

-- 6. Public insert — the token is validated here rather than in a policy.
create or replace function public.album_add_photo(
  token_value text, path_value text, uploader_value text
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  new_id uuid;
begin
  ev_id := public.album_event_id(token_value);
  if ev_id is null then
    raise exception 'invalid album token' using errcode = '42501';
  end if;
  -- Bind the file to its event: the client picks the path, so without this a
  -- caller could index a file belonging to a different event's folder.
  if path_value is null or path_value not like ev_id::text || '/%' then
    raise exception 'path does not belong to this event' using errcode = '42501';
  end if;

  insert into public.album_photos (event_id, album_token, storage_path, uploader)
  values (ev_id, token_value, path_value, nullif(btrim(coalesce(uploader_value, '')), ''))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.album_event_id(text)                     from public;
revoke all on function public.album_list_by_token(text)                from public;
revoke all on function public.album_add_photo(text, text, text)        from public;
grant execute on function public.album_list_by_token(text)             to anon, authenticated;
grant execute on function public.album_add_photo(text, text, text)     to anon, authenticated;
-- album_event_id stays internal: it maps a token to an id and nothing else
-- needs that mapping directly.

-- 7. Storage policies, scoped to this bucket AND to a folder that is a real
--    event. Deletes are restricted to the owner of that event — the earlier
--    `bucket_id = 'event-album'` alone would have let any signed-up user
--    delete any host's photos.
drop policy if exists album_objects_insert on storage.objects;
create policy album_objects_insert
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'event-album');

drop policy if exists album_objects_select on storage.objects;
create policy album_objects_select
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-album');

drop policy if exists album_objects_owner_delete on storage.objects;
create policy album_objects_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-album'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

comment on table public.album_photos is
  'Index of shared event-album photos. Anonymous access goes through album_list_by_token / album_add_photo (SECURITY DEFINER); the table itself is owner-only, because its rows carry the album token.';

-- NOTE — residual risk, recorded rather than hidden: an unauthenticated caller
-- can still PUT an object into the bucket without a token, because a storage
-- policy cannot validate one. The object is unreachable (nothing indexes it and
-- the gallery reads only the index), and the bucket caps size and MIME type, so
-- the exposure is wasted storage rather than data. Closing it fully needs
-- signed upload URLs minted by an Edge Function, which is a separate change.

-- 8. Teach the public token lookup about the album token, and expose the invite
--    token so the announcement pages resolve through the same call.
create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
    -- Only serve the site once the host has published it, so an unpublished
    -- draft is never delivered to guests.
    'site', case when coalesce((e.payload->'eventSite'->>'enabled')::boolean, false)
                 then e.payload->'eventSite' else null end,
    -- Save-the-Date / invitation. Each carries its own enabled flag, checked
    -- by the page.
    'announcements', e.payload->'announcements',
    -- Sibling public tokens so the pages can link to each other. hostess_token
    -- is deliberately NOT exposed: it unlocks the full guest list and seating
    -- map, and the invite link is shared with every guest.
    'rsvp_token', e.rsvp_token, 'gift_token', e.gift_token, 'invite_token', e.invite_token)
  from public.events e
  where token_value is not null and char_length(token_value) >= 8
    and case token_type
      when 'rsvp'    then e.rsvp_token    = token_value
      when 'invite'  then e.invite_token  = token_value
      when 'gift'    then e.gift_token    = token_value
      when 'hostess' then e.hostess_token = token_value
      when 'album'   then e.payload->>'albumToken' = token_value
      else false end
  limit 1;
$$;
revoke all on function public.public_event_by_token(text, text) from public;
grant execute on function public.public_event_by_token(text, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260728000000_public_write_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Public-surface hardening.
--
-- Everything a guest can reach without an account is re-checked here. Four
-- things were open, all of them chaining into each other: an anonymous caller
-- could list the whole album bucket, harvest every event id from it, and then
-- write arbitrary rows into any host's RSVP list and gift wall — none of the
-- public write paths validated a token, and the length limits that were meant
-- to bound them were never actually applied.
--
-- Run in the Supabase SQL editor. Idempotent — safe to run more than once.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The bounds from 20260719 never existed.
--
-- That migration used `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS`, which is
-- not valid PostgreSQL — there is no IF NOT EXISTS for ADD CONSTRAINT (only for
-- ADD COLUMN). The statement raises a syntax error, so the whole script aborted
-- and not one of those eight bounds is on the table. Re-issued correctly, each
-- guarded so a re-run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  alter table public.rsvp_responses
    add constraint ck_rsvp_guest_name_len check (char_length(guest_name) <= 200);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.rsvp_responses
    add constraint ck_rsvp_phone_len check (phone is null or char_length(phone) <= 40);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.rsvp_responses
    add constraint ck_rsvp_guests_count_range check (guests_count between 0 and 50);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.gifts
    add constraint ck_gift_donor_name_len check (char_length(donor_name) <= 200);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.gifts
    add constraint ck_gift_message_len check (message is null or char_length(message) <= 1000);
exception when duplicate_object then null; end $$;

-- Amounts are agorot. Floor of ₪5, ceiling of ₪100,000 — a gift outside that
-- range is a typo or an attack, not a guest.
do $$
begin
  alter table public.gifts
    add constraint ck_gift_amount_range check (amount between 500 and 10000000);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RSVP and gift writes move behind token-validated functions.
--
-- Both tables carried `FOR INSERT WITH CHECK (true)` and the client wrote them
-- directly, so the token check lived only in JavaScript — i.e. nowhere. Anyone
-- holding an event id could post unlimited rows into a stranger's RSVP list and
-- onto the blessing wall shown on the screen at their venue.
--
-- These mirror submit_guest_by_token, which already had the right shape.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.submit_rsvp_by_token(
  token_value   text,
  guest_name    text,
  phone         text,
  status        text,
  guests_count  int,
  companions    text[],
  shuttle_id    text
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  n     int;
begin
  if token_value is null or char_length(token_value) < 8 then
    raise exception 'invalid token';
  end if;

  select e.id into ev_id
    from public.events e
   where e.rsvp_token = token_value
   limit 1;

  if ev_id is null then
    raise exception 'invalid token';
  end if;

  if coalesce(trim(guest_name), '') = '' then
    raise exception 'name required';
  end if;

  -- Same ceiling submit_guest_by_token uses. A real event does not have 5000
  -- responses; anything past it is someone hammering the endpoint.
  select count(*) into n from public.rsvp_responses where event_id = ev_id;
  if n >= 5000 then
    raise exception 'limit reached';
  end if;

  insert into public.rsvp_responses
    (event_id, guest_name, phone, attending, guests_count, status, companions, shuttle_id)
  values (
    ev_id,
    left(trim(guest_name), 200),
    nullif(left(trim(coalesce(phone, '')), 40), ''),
    status = 'yes',
    greatest(0, least(50, coalesce(guests_count, 1))),
    case when status in ('yes', 'no', 'maybe') then status else 'yes' end,
    coalesce(companions, '{}')::text[],
    nullif(trim(coalesce(shuttle_id, '')), '')
  );
end; $$;

revoke all on function public.submit_rsvp_by_token(text, text, text, text, int, text[], text) from public;
grant execute on function public.submit_rsvp_by_token(text, text, text, text, int, text[], text) to anon, authenticated;

create or replace function public.submit_gift_by_token(
  token_value text,
  donor_name  text,
  amount      bigint,
  message     text
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  n     int;
begin
  if token_value is null or char_length(token_value) < 8 then
    raise exception 'invalid token';
  end if;

  select e.id into ev_id
    from public.events e
   where e.gift_token = token_value
   limit 1;

  if ev_id is null then
    raise exception 'invalid token';
  end if;

  if coalesce(trim(donor_name), '') = '' then
    raise exception 'name required';
  end if;

  if amount is null or amount < 500 or amount > 10000000 then
    raise exception 'amount out of range';
  end if;

  select count(*) into n from public.gifts where event_id = ev_id;
  if n >= 5000 then
    raise exception 'limit reached';
  end if;

  insert into public.gifts (event_id, donor_name, amount, message, paid)
  values (ev_id, left(trim(donor_name), 200), amount,
          nullif(left(trim(coalesce(message, '')), 1000), ''), false);
end; $$;

revoke all on function public.submit_gift_by_token(text, text, bigint, text) from public;
grant execute on function public.submit_gift_by_token(text, text, bigint, text) to anon, authenticated;

-- Now close the direct paths those functions replace.
drop policy if exists "rsvp_public_insert"  on public.rsvp_responses;
drop policy if exists "gifts_public_insert" on public.gifts;
revoke insert on public.rsvp_responses from anon;
revoke insert on public.gifts          from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The gift wall policy was reading every gift in the database.
--
-- `CREATE POLICY ... FOR SELECT USING (paid = true)` with no TO clause defaults
-- to PUBLIC, so anon could select * from gifts and get donor names, messages,
-- amounts and stripe_payment_intent for every customer — while the token-gated
-- RPC deliberately returns only name/message/date. The wall reads through
-- gift_wall_by_token, so nothing depends on this policy.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "gifts_wall_select" on public.gifts;
revoke select on public.gifts from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Album storage: stop the bucket-wide LIST.
--
-- `using (bucket_id = 'event-album')` scoped to the bucket but not to a folder,
-- so an anonymous caller could list every event's folder — which is both a
-- gallery leak and a way to harvest event ids in bulk. Guests are unaffected:
-- the gallery lists through album_list_by_token and loads each image by its
-- public URL, which a public bucket serves without consulting this policy.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists album_objects_select on storage.objects;
create policy album_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-album'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

-- Uploads stay open to anon — guests photographing a wedding do not have
-- accounts — but are pinned to a folder that is a real event. A storage policy
-- cannot see `events` as anon (no SELECT grant), so the check goes through a
-- SECURITY DEFINER helper. This does not make an event id a secret; it stops
-- the bucket being used as free anonymous file hosting on our domain.
create or replace function public.album_folder_is_event(folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events e where e.id::text = folder);
$$;
revoke all on function public.album_folder_is_event(text) from public;
grant execute on function public.album_folder_is_event(text) to anon, authenticated;

drop policy if exists album_objects_insert on storage.objects;
create policy album_objects_insert
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'event-album'
    and public.album_folder_is_event((storage.foldername(name))[1])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. public_event_by_token: stop over-sharing.
--
-- Two changes. Unpublished announcements were served in full and hidden only by
-- client-side JS, so a guest reading the raw response saw a save-the-date the
-- host had not announced yet — the adjacent `site` key already gated on its
-- enabled flag, this now matches it. And every token type received all three
-- sibling tokens, which made the four guest-facing links one link: a leaked
-- album QR could not be revoked without killing RSVP and the invite too.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
    -- Only serve the site once the host has published it.
    'site', case when coalesce((e.payload->'eventSite'->>'enabled')::boolean, false)
                 then e.payload->'eventSite' else null end,
    -- Same rule, per announcement kind: a draft never leaves the database.
    'announcements', (
      select jsonb_object_agg(k, v)
        from jsonb_each(coalesce(e.payload->'announcements', '{}'::jsonb)) as a(k, v)
       where coalesce((v->>'enabled')::boolean, false)
    ),
    -- Sibling tokens only where a page actually links onward. The invite page
    -- is the hub and needs RSVP; the RSVP page links back to the site. The
    -- album and gift pages link to neither, so they get neither. hostess_token
    -- and collab_token are never exposed here — they unlock the full guest list
    -- with phone numbers.
    'rsvp_token',   case when token_type in ('invite', 'rsvp') then e.rsvp_token   end,
    'gift_token',   case when token_type in ('invite', 'gift') then e.gift_token   end,
    'invite_token', case when token_type in ('invite', 'rsvp') then e.invite_token end)
  from public.events e
  where token_value is not null and char_length(token_value) >= 8
    and case token_type
      when 'rsvp'    then e.rsvp_token    = token_value
      when 'invite'  then e.invite_token  = token_value
      when 'gift'    then e.gift_token    = token_value
      when 'hostess' then e.hostess_token = token_value
      when 'album'   then e.payload->>'albumToken' = token_value
      else false end
  limit 1;
$$;
revoke all on function public.public_event_by_token(text, text) from public;
grant execute on function public.public_event_by_token(text, text) to anon, authenticated;

comment on function public.submit_rsvp_by_token(text, text, text, text, int, text[], text) is
  'Token-validated RSVP write. Replaces the direct anon INSERT, which accepted any event_id.';
comment on function public.submit_gift_by_token(text, text, bigint, text) is
  'Token-validated gift write. Replaces the direct anon INSERT, which accepted any event_id.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260730000000_public_delete_policies.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- The host can finally remove an RSVP row or a blessing from the wall.
--
-- Every public table had SELECT and INSERT policies and no DELETE policy at
-- all: `grep "FOR DELETE"` across every migration returned exactly two hits,
-- both for album photos. There was no delete UI either.
--
-- What that means in practice: a guest photographs the gift QR at the venue and
-- posts blessings onto the wall being projected on the screen. The 28.7
-- hardening capped anonymous writes at 5,000 rows per event, so the damage is
-- bounded — but nobody, not the couple and not an admin, had any way to remove
-- a single row short of opening the Supabase dashboard and writing SQL. The
-- same applies to RSVP rows, which drive the meal-count forecast the caterer is
-- ordered from.
--
-- Scope: the OWNER of the event only. Anonymous holders of a public token can
-- still only insert, exactly as before — nothing here widens anonymous access.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── RSVP responses ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rsvp_owner_delete" ON public.rsvp_responses;
CREATE POLICY "rsvp_owner_delete" ON public.rsvp_responses
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = rsvp_responses.event_id
        AND e.user_id = auth.uid()
    )
  );

-- ── Gift wall ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "gifts_owner_delete" ON public.gifts;
CREATE POLICY "gifts_owner_delete" ON public.gifts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = gifts.event_id
        AND e.user_id = auth.uid()
    )
  );

-- ── Collaborative guest table ────────────────────────────────────────────────
-- The screen already offers a delete button; it went through the token RPC.
-- The owner should be able to remove a row from their own account too.
DROP POLICY IF EXISTS "collab_owner_delete" ON public.collab_guests;
CREATE POLICY "collab_owner_delete" ON public.collab_guests
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = collab_guests.event_id
        AND e.user_id = auth.uid()
    )
  );
