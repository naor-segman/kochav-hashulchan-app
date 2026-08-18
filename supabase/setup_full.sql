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

-- NOTE ON ORDER: this helper is defined AFTER public.profiles, not before.
-- It was the other way round, and with check_function_bodies on (the
-- PostgreSQL and Supabase default) the body is validated at CREATE time:
--   ERROR:  relation "public.profiles" does not exist
-- The Supabase SQL Editor runs a pasted script in ONE transaction, so
-- setup_full.sql rolled the whole thing back and a fresh project came up
-- with zero tables. Reproduced on PostgreSQL 16; the ordering was the sole
-- cause. That file is the disaster-recovery path, so it has to be runnable.
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

-- ── 2-3. Length constraints on rsvp_responses and gifts ──────────────────────
--
-- REMOVED, not relocated. These were eight `ALTER TABLE … ADD CONSTRAINT IF NOT
-- EXISTS` clauses, and PostgreSQL has no such form:
--
--   ERROR:  syntax error at or near "NOT"
--   LINE 2:   ADD CONSTRAINT IF NOT EXISTS ck_rsvp_guest_name_nonempty
--
-- So they never applied, on any database, ever -- which is what
-- 20260811030000_fix_length_constraints.sql was written to discover and repair,
-- and that migration adds every one of them properly, guarded on pg_constraint.
--
-- They are deleted here rather than left as documentation because this file is
-- concatenated into supabase/setup_full.sql, and the Supabase SQL Editor runs a
-- pasted script in ONE transaction: a single syntax error rolled the entire
-- fresh-project build back to zero tables. Reproduced on PostgreSQL 16.
-- Removing dead statements changes no existing database, because they never ran.

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260730000001_collab_active_switch.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- The shared guest table gets an ON/OFF switch.
--
-- The collab token is a full-control capability: whoever holds the link can
-- read every guest's phone number, edit any row, delete any row and export the
-- lot to Excel. It is minted once and there was no way to withdraw it — a
-- single forward in a family WhatsApp group was permanent.
--
-- The host asked for a switch rather than a new link, and that is the better
-- shape: the relatives keep the link they already have, and the host decides
-- when it answers. Same URL, on or off.
--
-- Enforced HERE, not in the client. A toggle that only hides a button is
-- decoration — anyone holding the token can call these RPCs directly.
--
-- Default is ON, so nothing changes for an event that is already being filled
-- in: `payload->>'collabActive'` is absent on every existing row, and absent
-- means active. Only an explicit "false" closes it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.collab_is_active(e public.events)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(e.payload->>'collabActive', 'true') <> 'false';
$$;

-- ── Read the event behind the token ──────────────────────────────────────────
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
    AND public.collab_is_active(e)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.collab_event_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_event_by_token(text) TO anon, authenticated;

-- ── List the rows ────────────────────────────────────────────────────────────
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
    AND char_length(token_value) >= 8
    AND public.collab_is_active(e);
$$;
REVOKE ALL ON FUNCTION public.collab_list_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text) TO anon, authenticated;

-- ── Write paths ──────────────────────────────────────────────────────────────
-- The two that matter most: with the switch off, a holder of the link must not
-- be able to add, change or remove a row either.
CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid; row_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value
      AND char_length(token_value) >= 8
      AND public.collab_is_active(e)
    LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.collab_delete_by_token(token_value text, row_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value
      AND char_length(token_value) >= 8
      AND public.collab_is_active(e)
    LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  DELETE FROM public.collab_guests WHERE id = row_id AND event_id = ev_id;
END;
$$;
REVOKE ALL ON FUNCTION public.collab_delete_by_token(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_delete_by_token(text, uuid) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260730000002_error_reports.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Error reporting.
--
-- Until now a crash on a customer's phone left NO trace anywhere: the error
-- boundary rendered a message and the exception went to that browser's console
-- and disappeared. The owner would find out only if the couple happened to
-- call. Before running real events that is the gap worth closing first, because
-- an event happens once and there is no second chance to reproduce it.
--
-- Deliberately NOT a third-party service. Supabase is already here, the admin
-- panel is already here, and there is no account to open, no DSN to configure
-- and no bill. What it gives up versus Sentry is release tracking, symbolicated
-- stacks and grouping — worth adding later if the volume ever justifies it.
--
-- PRIVACY: the client sends the message, a truncated stack, the route and the
-- browser. It does NOT send guest data, and it scrubs public tokens out of the
-- path before sending (see src/utils/errorReport.js) — a token in a URL is a
-- credential, and this table is read by the admin panel.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.error_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  message     text        NOT NULL,
  stack       text,
  route       text,
  user_agent  text,
  kind        text        NOT NULL DEFAULT 'render',
  seen        boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS error_reports_created_idx ON public.error_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS error_reports_unseen_idx  ON public.error_reports (seen, created_at DESC);

ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- No direct access for anybody. Writes go through the RPC below (which bounds
-- the payload and rate-limits), reads are admin-only.
CREATE POLICY "error_reports_admin_select" ON public.error_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "error_reports_admin_update" ON public.error_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "error_reports_admin_delete" ON public.error_reports
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── The write path ───────────────────────────────────────────────────────────
-- Callable by anyone, because the pages that crash hardest are the PUBLIC ones
-- a guest opens from a WhatsApp link, where there is no session at all.
--
-- Three guards, because an endpoint anonymous callers can write to is an
-- endpoint someone will flood:
--   • every field is length-bounded here, not trusted from the client;
--   • a crash LOOP (the boundary's reload re-crashing) is collapsed — the same
--     message on the same route within 10 minutes is dropped rather than
--     written 400 times;
--   • a global ceiling of 200 rows per hour, after which writes are ignored.
CREATE OR REPLACE FUNCTION public.report_error(
  p_message    text,
  p_stack      text DEFAULT NULL,
  p_route      text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_kind       text DEFAULT 'render'
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_message text := nullif(left(trim(coalesce(p_message, '')), 500), '');
  v_route   text := left(coalesce(p_route, ''), 200);
BEGIN
  IF v_message IS NULL THEN RETURN; END IF;

  -- Crash loop: same message, same route, already recorded in the last 10 min.
  IF EXISTS (
    SELECT 1 FROM public.error_reports
    WHERE message = v_message
      AND coalesce(route, '') = v_route
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  -- Global ceiling.
  IF (SELECT count(*) FROM public.error_reports WHERE created_at > now() - interval '1 hour') >= 200 THEN
    RETURN;
  END IF;

  INSERT INTO public.error_reports (user_id, message, stack, route, user_agent, kind)
  VALUES (
    auth.uid(),
    v_message,
    left(coalesce(p_stack, ''), 4000),
    v_route,
    left(coalesce(p_user_agent, ''), 300),
    coalesce(nullif(left(p_kind, 20), ''), 'render')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_error(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.report_error(text, text, text, text, text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260811000000_entrance_scoped_writes.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- עמדת כניסה — the entrance link stops being read-only.
--
-- The hostess token could only VIEW. So at a real event the greeter was handed
-- the OWNER'S ACCOUNT to mark arrivals — the one credential that can also read
-- every phone number, edit the guest list, and delete the event. That is unsafe
-- and impractical, and it is what actually happened.
--
-- This migration gives the same token exactly ONE write: which people of one
-- guest row are physically in the room. It cannot add a guest, cannot move
-- anyone between tables, cannot read a phone number, cannot touch gifts. Not
-- because the client declines to offer those — a token holder can call any RPC
-- directly with curl — but because this is the only write function the token
-- opens, and it touches exactly two keys on one row.
--
-- Shape copied deliberately from 20260730000001_collab_active_switch.sql:
-- SECURITY DEFINER keyed on the token, every field length-bounded server-side,
-- and an on/off switch read from payload->>'hostessWriteActive' so the host can
-- close the door link after the event without invalidating the URL the greeter
-- already has.
--
-- Default is ON. Absent means open, exactly as `collabActive` behaves, because
-- the failure mode of defaulting to closed is that the next event repeats the
-- one this fixes: the greeter opens the link, it does nothing, and nobody knows
-- why. Only an explicit "false" closes it.
--
-- ARRIVAL IS PER-PERSON. A guest row is a GROUP — `count` people, `companions`
-- names. `arrived` was one boolean for the whole row, so marking the aunt
-- marked her husband and three children with her. The canonical field is now
-- `arrivedSeats`: an array of seat indices. `arrived` is still written, as
-- "somebody from this row is here", so every existing reader keeps working.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The switch ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hostess_writes_active(e public.events)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(e.payload->>'hostessWriteActive', 'true') <> 'false';
$$;

-- ── Read ─────────────────────────────────────────────────────────────────────
-- Replaces the version in 20260723000001_companions.sql. Three additions, each
-- for a thing the screen could not do without it:
--   arrivedSeats — otherwise the greeter's phone shows everyone as not-arrived
--                  and she re-marks people who are already inside;
--   capacity/shape — the table glyph on this screen was already being rendered
--                  with `shape` and `capacity` that this function never
--                  returned, so it drew a default-shaped, zero-capacity table
--                  on every chip;
--   writes_open  — so the UI can say "the host has closed marking" instead of
--                  failing silently on every tap.
-- Phone numbers are still absent. That has not changed and must not.
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
        'id',           g->>'id',
        'name',         g->>'name',
        'count',        COALESCE((g->>'count')::int, 1),
        'companions',   COALESCE(g->'companions', '[]'::jsonb),
        'rsvp',         g->>'rsvp',
        'arrived',      COALESCE((g->>'arrived')::boolean, false),
        'arrivedSeats', COALESCE(g->'arrivedSeats', 'null'::jsonb)
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
    ), '[]'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',       t->>'id',
        'name',     t->>'name',
        'capacity', COALESCE((t->>'capacity')::int, 0),
        'shape',    t->>'shape'
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'tables', '[]'::jsonb)) t
    ), '[]'::jsonb),
    'seating',     COALESCE(e.payload->'seating', '{}'::jsonb),
    'writes_open', public.hostess_writes_active(e)
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.hostess_data_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_data_by_token(text) TO anon, authenticated;

-- ── The one write ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hostess_mark_arrival_by_token(
  token_value text,
  guest_id    text,
  seats       jsonb
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ev_id      uuid;
  seat_count int;
  clean      jsonb;
BEGIN
  SELECT e.id INTO ev_id
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
    AND public.hostess_writes_active(e)
  LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  IF guest_id IS NULL OR char_length(guest_id) = 0 OR char_length(guest_id) > 64 THEN
    RAISE EXCEPTION 'guest id required';
  END IF;

  -- The row's own seat count is the ceiling. A caller cannot invent seats for
  -- a party of two and inflate the number the host gives the caterer.
  SELECT greatest(1, COALESCE((g->>'count')::int, 1))
    INTO seat_count
  FROM public.events e,
       jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
  WHERE e.id = ev_id AND g->>'id' = guest_id
  LIMIT 1;
  IF seat_count IS NULL THEN RAISE EXCEPTION 'guest not found'; END IF;

  -- Deduped, sorted, integers only, inside [0, seat_count).
  --
  -- The regex is inside the CASE, not in a WHERE beside the cast: Postgres does
  -- not promise to evaluate a subquery's WHERE before its select list, and is
  -- free to push the cast down — so `["abc"]` would raise "invalid input syntax
  -- for type integer" instead of being quietly ignored, which is the exact
  -- failure this guard exists to prevent. Non-matching entries become NULL, and
  -- the outer predicate drops them (NULL >= 0 is NULL, not true).
  SELECT COALESCE(jsonb_agg(DISTINCT v ORDER BY v), '[]'::jsonb)
    INTO clean
  FROM (
    SELECT CASE WHEN x ~ '^[0-9]{1,3}$' THEN x::int END AS v
    FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(seats) = 'array' THEN seats ELSE '[]'::jsonb END
         ) AS x
  ) s
  WHERE v >= 0 AND v < seat_count;

  UPDATE public.events e
  SET payload = jsonb_set(
        e.payload,
        '{guests}',
        COALESCE((
          SELECT jsonb_agg(
            CASE WHEN t.g->>'id' = guest_id
              THEN t.g
                   || jsonb_build_object('arrivedSeats', clean)
                   || jsonb_build_object('arrived', to_jsonb(jsonb_array_length(clean) > 0))
              ELSE t.g
            END
            ORDER BY t.ord
          )
          FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb))
               WITH ORDINALITY AS t(g, ord)
        ), '[]'::jsonb)
      ),
      -- Bump the version so the owner's next optimistic push conflicts and
      -- re-pulls instead of silently overwriting arrivals marked at the door.
      version    = COALESCE(e.version, 1) + 1,
      updated_at = now()
  WHERE e.id = ev_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hostess_mark_arrival_by_token(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_mark_arrival_by_token(text, text, jsonb) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260811010000_collab_companions_restore.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- RESTORE: companion names on the shared collaborative table.
--
-- THE BUG (found 11.8, after a real event):
--   "מילאתי אורח עם 8 מלווים וכל השמות. זה מסתנכרן לעמוד אורחים. כשאני עורך,
--    זה נותן לי את הפרטים של האדם הראשי אבל מוחק את כל שמות המלווים."
--
-- 20260725000000_collab_companions.sql taught both token RPCs about the
-- `companions` column. Five days later 20260730000001_collab_active_switch.sql
-- added the on/off switch by doing CREATE OR REPLACE on the SAME two functions
-- — copied from the pre-companions version. Postgres does not merge function
-- bodies: the later file simply won the definition, and the companions support
-- was silently reverted in every database built or updated from it (including
-- setup_full.sql, whose last definition of these two functions is the broken
-- one).
--
-- What that cost, exactly:
--   * collab_upsert_by_token no longer wrote `companions` at all — not on
--     INSERT (which fell back to the '[]' default) and not in the ON CONFLICT
--     update. Every companion name a relative typed into the shared table was
--     discarded at the database.
--   * collab_list_by_token no longer returned `companions`, so on the next
--     load the shared table rendered every companion input blank — the exact
--     "it deletes all the companion names" the owner saw.
--   * The owner's app reads the table directly (RLS, not the RPC) and DOES
--     select companions, so it received '[]' and mirrored that emptiness into
--     the guest list, wiping names that had been typed in the app too.
--
-- This restores the companions handling ON TOP of the active-switch guard, so
-- both properties hold at once. Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- The column is created by 20260725000000; repeated here so this file can be
-- applied to a database that somehow missed it.
ALTER TABLE public.collab_guests
  ADD COLUMN IF NOT EXISTS companions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── List the rows: companions come back ──────────────────────────────────────
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
    'companions',   COALESCE(g.companions, '[]'::jsonb),
    'updated_at',   g.updated_at,
    'updated_by',   g.updated_by
  ) ORDER BY g.updated_at DESC), '[]'::jsonb)
  FROM public.collab_guests g
  JOIN public.events e ON e.id = g.event_id
  WHERE e.collab_token = token_value
    AND char_length(token_value) >= 8
    AND public.collab_is_active(e);
$$;
REVOKE ALL ON FUNCTION public.collab_list_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text) TO anon, authenticated;

-- ── Upsert a row: companions are stored again ────────────────────────────────
-- Positions are preserved (so "מלווה 2" stays the second seat); each name is
-- trimmed to 80 chars and the array capped at 49 entries (max extra seats for
-- guests_count ≤ 50).
CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid; row_id uuid; comp jsonb;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value
      AND char_length(token_value) >= 8
      AND public.collab_is_active(e)
    LIMIT 1;
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
-- 20260811020000_rsvp_meal.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The meal question moves to the person who knows the answer ──────────────
--
-- `meal` was settable ONLY on the host's guest list. So the host — who at that
-- point has not spoken to anyone — was guessing who is vegan, and the RSVP form
-- the guest actually fills in never asked. That is the wrong way round, and it
-- is the thing the owner named after running a real event: "אין להם מושג מי
-- יגיע, מה הוא רוצה אם הוא טבעוני… את כל הפרטים האלו מי שממלא זה האורח".
--
-- The choice rides along on the RSVP the guest is already submitting — one
-- form, one submission — exactly as `shuttle_id` does. Values are the keys from
-- MEAL_OPTIONS in src/data/constants.js. Free-form text, not an enum: the
-- option list lives in the client and a host who later removes an option must
-- not break rows already stored. An unrecognised value simply stops resolving
-- to a label.
--
-- Idempotent — safe to run more than once.

ALTER TABLE public.rsvp_responses
  ADD COLUMN IF NOT EXISTS meal text;

COMMENT ON COLUMN public.rsvp_responses.meal IS
  'Optional MEAL_OPTIONS key the guest chose (regular/kosher/vegan/vegetarian/child/none). Free-form: the option list lives in the client.';

-- The existing RLS policies on rsvp_responses scope by event ownership and
-- grant the ROW, not a column list, so the new column needs no policy.

-- ── The write path ──────────────────────────────────────────────────────────
-- A new 8-argument function. The 7-argument one is NOT dropped — it is
-- redefined below as a thin forwarder, because the service worker can serve a
-- cached build for days after a deploy and a guest on that build still calls
-- the 7-argument signature. Dropping it would turn "I clicked אישור הגעה" into
-- a permanent failure for exactly the people who already responded once.
CREATE OR REPLACE FUNCTION public.submit_rsvp_by_token(
  token_value   text,
  guest_name    text,
  phone         text,
  status        text,
  guests_count  int,
  companions    text[],
  shuttle_id    text,
  meal          text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev_id uuid;
  n     int;
BEGIN
  IF token_value IS NULL OR char_length(token_value) < 8 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT e.id INTO ev_id
    FROM public.events e
   WHERE e.rsvp_token = token_value
   LIMIT 1;

  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  IF COALESCE(trim(guest_name), '') = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  -- Same ceiling submit_guest_by_token uses. A real event does not have 5000
  -- responses; anything past it is someone hammering the endpoint.
  SELECT count(*) INTO n FROM public.rsvp_responses WHERE event_id = ev_id;
  IF n >= 5000 THEN RAISE EXCEPTION 'limit reached'; END IF;

  INSERT INTO public.rsvp_responses
    (event_id, guest_name, phone, attending, guests_count, status, companions, shuttle_id, meal)
  VALUES (
    ev_id,
    left(trim(guest_name), 200),
    nullif(left(trim(COALESCE(phone, '')), 40), ''),
    status = 'yes',
    greatest(0, least(50, COALESCE(guests_count, 1))),
    CASE WHEN status IN ('yes', 'no', 'maybe') THEN status ELSE 'yes' END,
    COALESCE(companions, '{}')::text[],
    nullif(trim(COALESCE(shuttle_id, '')), ''),
    -- Bounded server-side like every other free-form field here. A guest who
    -- is not coming has no meal.
    CASE WHEN status = 'no' THEN NULL
         ELSE nullif(left(trim(COALESCE(meal, '')), 40), '') END
  );
END; $$;

REVOKE ALL ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) TO anon, authenticated;

-- ── The old signature, kept alive as a forwarder ────────────────────────────
-- Same 7 arguments, same behaviour, meal NULL. Two functions with different
-- argument counts are not ambiguous to PostgREST, which resolves by the exact
-- set of argument NAMES it is given.
CREATE OR REPLACE FUNCTION public.submit_rsvp_by_token(
  token_value   text,
  guest_name    text,
  phone         text,
  status        text,
  guests_count  int,
  companions    text[],
  shuttle_id    text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.submit_rsvp_by_token(
    token_value, guest_name, phone, status, guests_count, companions, shuttle_id, NULL);
END; $$;

REVOKE ALL ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260811030000_fix_length_constraints.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The length constraints from 20260719 were never actually applied ─────────
--
-- 20260719000000_public_pages_hardening.sql writes
--
--   ALTER TABLE public.rsvp_responses
--     ADD CONSTRAINT IF NOT EXISTS ck_rsvp_guest_name_len CHECK (...),
--     ...
--
-- PostgreSQL has no `IF NOT EXISTS` for ADD CONSTRAINT. That is a syntax error,
-- so BOTH statements aborted whole and neither rsvp_responses nor gifts ever
-- received any of their eight checks. Nothing broke visibly — the RPCs bound
-- every field server-side anyway — but the file reads as if a second layer of
-- defence exists, and setup_full.sql carries the same broken statements into
-- any project built from it.
--
-- Added properly here, each one guarded by a catalog lookup so this file is
-- idempotent and safe on a database that somehow does have them.
--
-- ONE DELIBERATE CHANGE: ck_rsvp_phone_len allows 40, not 20. The RPC
-- (20260728000000) stores `left(trim(phone), 40)` and the client sends up to 40
-- — applying the original 20 now would start REJECTING RSVPs that have been
-- accepted all along, which is a worse outcome than the missing check.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('rsvp_responses', 'ck_rsvp_guest_name_nonempty', 'char_length(guest_name) > 0'),
      ('rsvp_responses', 'ck_rsvp_guest_name_len',      'char_length(guest_name) <= 200'),
      ('rsvp_responses', 'ck_rsvp_phone_len',           'phone IS NULL OR char_length(phone) <= 40'),
      ('rsvp_responses', 'ck_rsvp_guests_count_range',  'guests_count >= 0 AND guests_count <= 50'),
      ('gifts',          'ck_gift_donor_name_nonempty', 'char_length(donor_name) > 0'),
      ('gifts',          'ck_gift_donor_name_len',      'char_length(donor_name) <= 200'),
      ('gifts',          'ck_gift_message_len',         'message IS NULL OR char_length(message) <= 500'),
      ('gifts',          'ck_gift_amount_range',        'amount >= 5000 AND amount <= 10000000')
    ) AS t(tbl, name, expr)
  LOOP
    IF to_regclass('public.' || c.tbl) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conname = c.name
            AND conrelid = ('public.' || c.tbl)::regclass
       )
    THEN
      -- NOT VALID: existing rows are not re-checked. A row already stored that
      -- violates one of these is the host's data, and failing the migration to
      -- protect a length limit would be the wrong trade. New writes are checked.
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID',
                     c.tbl, c.name, c.expr);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260811040000_ai_rate_limit.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A real rate limit on the one endpoint that spends money ──────────────────
--
-- `detect-floor-plan` calls a paid vision model with the project's Anthropic
-- key. It already requires a signed-in user — without that, anyone holding the
-- anon key (which ships in the browser bundle) could bill us in a loop. But a
-- signed-in user can still loop it, and the only limit in front of it today is
-- `canUseAI(plan)`, which runs IN THE BROWSER. A client-side gate is a UI
-- affordance, not a limit: the RPC is reachable with curl.
--
-- So the count lives in Postgres, the check is atomic with the insert, and the
-- edge function claims a call BEFORE it spends the key.
--
-- Deliberately NOT a token bucket or a leaky bucket. This has to be obvious to
-- read at 2am when a host says "it stopped working": a plain row per call, a
-- plain count over a window, and a limit you can raise with an UPDATE.
--
-- Idempotent — safe to run more than once.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The only query this table serves: "how many calls for this user, of this
-- kind, since T". Ordered by time so the window scan is a range, not a sort.
CREATE INDEX IF NOT EXISTS ai_usage_user_kind_time
  ON public.ai_usage (user_id, kind, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- A user may READ their own usage — the UI can say "3 מתוך 10 היום" instead of
-- failing with no explanation. Nobody may INSERT directly: that is the whole
-- point, and it is why claim_ai_call is SECURITY DEFINER.
DROP POLICY IF EXISTS ai_usage_owner_read ON public.ai_usage;
CREATE POLICY ai_usage_owner_read ON public.ai_usage
  FOR SELECT USING (user_id = auth.uid());

-- ── The claim ────────────────────────────────────────────────────────────────
-- Returns the number of calls REMAINING in the tighter of the two windows, so
-- the caller can show it. Raises when the limit is reached — an exception, not
-- a false return, because the whole value of this function is that a caller
-- cannot ignore it by forgetting to check a boolean.
--
-- The count and the insert are in one statement so two concurrent calls cannot
-- both see "9 used" and both proceed.
CREATE OR REPLACE FUNCTION public.claim_ai_call(
  call_kind  text,
  per_hour   int DEFAULT 10,
  per_day    int DEFAULT 30
)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  used_hour int;
  used_day  int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF call_kind IS NULL OR char_length(call_kind) = 0 OR char_length(call_kind) > 64 THEN
    RAISE EXCEPTION 'call kind required';
  END IF;

  -- Bound what a caller can ask for. These arguments exist so the edge function
  -- can be tuned per endpoint, not so a client can hand itself a bigger budget.
  per_hour := greatest(1, least(COALESCE(per_hour, 10), 100));
  per_day  := greatest(1, least(COALESCE(per_day,  30), 500));

  WITH ins AS (
    INSERT INTO public.ai_usage (user_id, kind)
    SELECT uid, call_kind
    WHERE (SELECT count(*) FROM public.ai_usage
            WHERE user_id = uid AND kind = call_kind
              AND created_at > now() - interval '1 hour') < per_hour
      AND (SELECT count(*) FROM public.ai_usage
            WHERE user_id = uid AND kind = call_kind
              AND created_at > now() - interval '1 day') < per_day
    RETURNING 1
  )
  SELECT count(*)::int INTO used_hour FROM ins;

  IF used_hour = 0 THEN
    RAISE EXCEPTION 'rate limit reached' USING ERRCODE = '53400';
  END IF;

  SELECT count(*) INTO used_hour FROM public.ai_usage
   WHERE user_id = uid AND kind = call_kind AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO used_day FROM public.ai_usage
   WHERE user_id = uid AND kind = call_kind AND created_at > now() - interval '1 day';

  RETURN least(per_hour - used_hour, per_day - used_day);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_call(text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_ai_call(text, int, int) TO authenticated;

-- ── Housekeeping ─────────────────────────────────────────────────────────────
-- Nothing older than a day is ever read. Left as a function rather than wired
-- to a cron: this project has no scheduler yet, and an unbounded table of one
-- row per AI call grows at the speed of usage, which is slow enough that a
-- manual sweep is honest for now.
CREATE OR REPLACE FUNCTION public.prune_ai_usage()
RETURNS int
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  WITH gone AS (
    DELETE FROM public.ai_usage WHERE created_at < now() - interval '7 days'
    RETURNING 1
  ) SELECT count(*)::int FROM gone;
$$;
REVOKE ALL ON FUNCTION public.prune_ai_usage() FROM public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260812000000_collab_notes.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- הערות on the shared collaborative table.
--
-- THE GAP (owner, 12.8): the host's own guest form has a "הערות" field — the
-- dietary need, the wheelchair, "יושבים עם הסבים". A relative filling in the
-- shared table had nowhere to put any of it, so the host had to go and ask for
-- it in a separate WhatsApp message. Chasing the details by hand is the exact
-- thing the shared table exists to avoid.
--
-- ⚠ THIS FILE IS A FULL REDEFINITION OF BOTH TOKEN RPCs.
-- Postgres does not merge function bodies: CREATE OR REPLACE simply wins. That
-- is how companion support was silently reverted once already
-- (20260730000001 replaced these two functions with a pre-companions copy —
-- see 20260811010000_collab_companions_restore.sql for the full post-mortem).
-- So the definitions below are the CURRENT ones from
-- 20260811010000_collab_companions_restore.sql, carried over field for field —
-- the active-switch guard (`collab_is_active`), the ≥8-char token check, the
-- 5000-row cap, the cross-event WHERE on the update, and the whole companions
-- normalisation — with `notes` added and nothing else changed. If you are
-- reading this while writing the NEXT migration that touches these functions:
-- copy from here, not from an older file.
--
-- MERGE RULE — an absent key is not an instruction.
--   * `notes` present as a STRING  → that is the writer's answer and it wins,
--     including "" (someone emptied the box; the note is cleared).
--   * `notes` absent, or JSON null → NO OPINION. The stored note is kept.
-- The second half is the part that matters. Every client that has not shipped
-- this feature yet still writes rows through this function, and it sends no
-- `notes` key at all. Reading that silence as "clear the note" would let an old
-- tab, or a cached PWA, quietly delete a note somebody else typed — which is
-- precisely the failure that destroyed eight companion names in August. The
-- companions column still cannot express "leave it alone" (both write paths
-- coerce a missing array to '[]'); notes is born able to, and the client side
-- omits the key rather than sending null (src/utils/publicTokens.js).
--
-- Bounded server-side like every other free-form column here: trimmed, capped
-- at 500 chars, '' stored as NULL.
--
-- Reviewed, NOT executed — there is no live Supabase in the environment this
-- was written in. Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The column ────────────────────────────────────────────────────────────
ALTER TABLE public.collab_guests
  ADD COLUMN IF NOT EXISTS notes text;

-- The CHECK is added through the catalog rather than with a bare ADD
-- CONSTRAINT, because `ADD CONSTRAINT IF NOT EXISTS` is not PostgreSQL syntax —
-- writing it that way is what silently aborted all eight checks in
-- 20260719000000 (see 20260811030000_fix_length_constraints.sql). NOT VALID:
-- existing rows are not re-checked; new writes are.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_collab_notes_len'
       AND conrelid = 'public.collab_guests'::regclass
  ) THEN
    ALTER TABLE public.collab_guests
      ADD CONSTRAINT ck_collab_notes_len
      CHECK (notes IS NULL OR char_length(notes) <= 500) NOT VALID;
  END IF;
END $$;

-- ── 2. List the rows: notes come back ────────────────────────────────────────
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
    'companions',   COALESCE(g.companions, '[]'::jsonb),
    -- Deliberately '' and not NULL: the client distinguishes "no key" (a
    -- database that has not run this migration → keep whatever the app holds)
    -- from an explicit empty string (cleared). A JSON null would land in the
    -- first bucket and a cleared note would come back from the dead on the
    -- next poll.
    'notes',        COALESCE(g.notes, ''),
    'updated_at',   g.updated_at,
    'updated_by',   g.updated_by
  ) ORDER BY g.updated_at DESC), '[]'::jsonb)
  FROM public.collab_guests g
  JOIN public.events e ON e.id = g.event_id
  WHERE e.collab_token = token_value
    AND char_length(token_value) >= 8
    AND public.collab_is_active(e);
$$;
REVOKE ALL ON FUNCTION public.collab_list_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text) TO anon, authenticated;

-- ── 3. Upsert a row: notes are stored, absence is respected ──────────────────
-- Companions unchanged from 20260811010000: positions preserved (so "מלווה 2"
-- stays the second seat); each name trimmed to 80 chars and the array capped at
-- 49 entries (max extra seats for guests_count ≤ 50).
CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ev_id uuid; row_id uuid; comp jsonb;
  has_notes boolean; note_val text;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value
      AND char_length(token_value) >= 8
      AND public.collab_is_active(e)
    LIMIT 1;
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

  -- Only a STRING is an opinion about the note. Absent key, or JSON null, both
  -- mean "leave the stored value alone" on an existing row.
  has_notes := (row_data ? 'notes') AND jsonb_typeof(row_data->'notes') = 'string';
  note_val  := CASE WHEN has_notes
                    THEN nullif(left(trim(row_data->>'notes'), 500), '')
                    ELSE NULL END;

  INSERT INTO public.collab_guests (id, event_id, name, phone, side, guest_group, guests_count, companions, notes, updated_by, updated_at)
  VALUES (
    row_id, ev_id,
    nullif(left(trim(coalesce(row_data->>'name','')), 120), ''),
    nullif(left(trim(coalesce(row_data->>'phone','')), 20), ''),
    nullif(left(row_data->>'side', 20), ''),
    nullif(left(row_data->>'guest_group', 60), ''),
    greatest(1, least(50, coalesce((row_data->>'guests_count')::int, 1))),
    comp,
    note_val,
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
    notes        = CASE WHEN has_notes THEN excluded.notes
                        ELSE public.collab_guests.notes END,
    updated_by   = excluded.updated_by,
    updated_at   = now()
  WHERE public.collab_guests.event_id = ev_id;  -- never move a row across events
END;
$$;
REVOKE ALL ON FUNCTION public.collab_upsert_by_token(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_upsert_by_token(text, jsonb) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260813000000_arrival_timestamps.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- A timestamp on every arrival, so two people marking the same list can be
-- told apart.
--
-- THE BUG THIS FIXES (found by the data-integrity review, 12.8)
-- Arrivals are the only field on a guest row written by SOMEONE ELSE, from a
-- device the host's tab never sees: the greeter, through the entrance token.
-- The client merge asked "has the local copy expressed an opinion about this
-- guest?" and kept the local value if so. That question cannot distinguish a
-- local opinion from a value the client COPIED FROM THE CLOUD a minute earlier
-- — so after the first merge, the local copy was never silent again and every
-- later cloud update for that row was dropped, then pushed back over the cloud.
--
-- Measured, before the fix:
--   after wave 1 merge, local arrivedSeats = [0]
--   cloud arrivedSeats after wave 2        = [0,1]
--   after wave 2 merge, local arrivedSeats = [0]
--   cloud after the host's next push       = [0]      <-- seat 1 lost
--
-- In the hall that is a family arriving in two cars, or a greeter correcting
-- "2 of 4" to "3 of 4" and watching it revert.
--
-- THE FIX: whoever wrote LAST wins. That is the only question about arrivals
-- with a correct answer, because the two writers are two different people and
-- neither is authoritative over the other. It needs a timestamp on the row, and
-- the greeter's write happens HERE, in the database, so the database has to
-- stamp it. The client stamps its own writes in src/utils/arrival.js
-- (withArrivedSeats), which is the single choke point for all of them.
--
-- Epoch MILLISECONDS, to match JavaScript's Date.now() on the other side — a
-- seconds-based timestamp would compare as "always older" against every client
-- value and hand the host permanent priority, which is the bug again with the
-- sign flipped.
--
-- WHY THIS IS ALSO A FULL REDEFINITION
-- Postgres does not merge function bodies. The definition below is the CURRENT
-- one from 20260811000000_entrance_scoped_writes.sql, carried over line for
-- line — the active-switch guard, the ≥8-char token check, the seat-count
-- ceiling, the regex-inside-the-CASE guard and the version bump — with
-- `arrivedAt` added and nothing else changed. If you are writing the next
-- migration that touches this function: copy from here, not from an older file.
-- (Doing the opposite is how companion support was silently reverted once
-- already — see 20260811010000_collab_companions_restore.sql.)
--
-- Idempotent: safe to run more than once. Adds no column — `arrivedAt` lives
-- inside the guest object in `payload`, exactly like `arrivedSeats`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hostess_mark_arrival_by_token(
  token_value text,
  guest_id    text,
  seats       jsonb
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ev_id      uuid;
  seat_count int;
  clean      jsonb;
  stamp_ms   bigint;
BEGIN
  SELECT e.id INTO ev_id
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
    AND public.hostess_writes_active(e)
  LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  IF guest_id IS NULL OR char_length(guest_id) = 0 OR char_length(guest_id) > 64 THEN
    RAISE EXCEPTION 'guest id required';
  END IF;

  -- The row's own seat count is the ceiling. A caller cannot invent seats for
  -- a party of two and inflate the number the host gives the caterer.
  SELECT greatest(1, COALESCE((g->>'count')::int, 1))
    INTO seat_count
  FROM public.events e,
       jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
  WHERE e.id = ev_id AND g->>'id' = guest_id
  LIMIT 1;
  IF seat_count IS NULL THEN RAISE EXCEPTION 'guest not found'; END IF;

  -- Deduped, sorted, integers only, inside [0, seat_count).
  --
  -- The regex is inside the CASE, not in a WHERE beside the cast: Postgres does
  -- not promise to evaluate a subquery's WHERE before its select list, and is
  -- free to push the cast down — so `["abc"]` would raise "invalid input syntax
  -- for type integer" instead of being quietly ignored, which is the exact
  -- failure this guard exists to prevent. Non-matching entries become NULL, and
  -- the outer predicate drops them (NULL >= 0 is NULL, not true).
  SELECT COALESCE(jsonb_agg(DISTINCT v ORDER BY v), '[]'::jsonb)
    INTO clean
  FROM (
    SELECT CASE WHEN x ~ '^[0-9]{1,3}$' THEN x::int END AS v
    FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(seats) = 'array' THEN seats ELSE '[]'::jsonb END
         ) AS x
  ) s
  WHERE v >= 0 AND v < seat_count;

  -- Milliseconds since the epoch, the same unit Date.now() produces. Taken once
  -- so every guest touched in one call carries the identical stamp.
  stamp_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  UPDATE public.events e
  SET payload = jsonb_set(
        e.payload,
        '{guests}',
        COALESCE((
          SELECT jsonb_agg(
            CASE WHEN t.g->>'id' = guest_id
              THEN t.g
                   || jsonb_build_object('arrivedSeats', clean)
                   || jsonb_build_object('arrived', to_jsonb(jsonb_array_length(clean) > 0))
                   || jsonb_build_object('arrivedAt', to_jsonb(stamp_ms))
              ELSE t.g
            END
            ORDER BY t.ord
          )
          FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb))
               WITH ORDINALITY AS t(g, ord)
        ), '[]'::jsonb)
      ),
      -- Bump the version so the owner's next optimistic push conflicts and
      -- re-pulls instead of silently overwriting arrivals marked at the door.
      version    = COALESCE(e.version, 1) + 1,
      updated_at = now()
  WHERE e.id = ev_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hostess_mark_arrival_by_token(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_mark_arrival_by_token(text, text, jsonb) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260814000000_collab_parents_type.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- collab_event_by_token — carry parentsType to the shared guest table
--
-- A bar mitzvah, a bat mitzvah and a brit split the room into the celebrant's
-- two families, and the app now lets the host say what those families are
-- (two mothers, two fathers, a single parent) instead of hard-coding
-- "משפחת האם" / "משפחת האב".
--
-- The collab screen — the one the extended family opens from a WhatsApp link
-- to add names — renders its side labels with the same getSideLabels(ev) as the
-- app. Without parents_type in this RPC's result, that screen keeps showing the
-- old hard-coded pair: the host corrects the wording in the app, and every
-- relative still sees the version the picker exists to avoid.
--
-- The value already reaches the database on its own: it lives inside the events
-- payload jsonb, which cloudSync writes wholesale. Only the read needed
-- widening, so this is a function redefinition and touches no table.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.collab_event_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',           e.id,
    'name',         e.name,
    'type',         e.type,
    'bride_name',   e.payload->>'brideName',
    'groom_name',   e.payload->>'groomName',
    'couple_type',  e.payload->>'coupleType',
    'parents_type', e.payload->>'parentsType',
    'side_labels',  e.payload->'sideLabels'
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.collab_token = token_value
    AND public.collab_is_active(e)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.collab_event_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_event_by_token(text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260814010000_fix_rsvp_companions_type.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- submit_rsvp_by_token — every RSVP submission was failing at the database
--
-- rsvp_responses.companions is jsonb (20260723000001_companions.sql:8), and the
-- function inserted `COALESCE(companions,'{}')::text[]` into it. PostgreSQL has
-- no assignment cast from text[] to jsonb, so the INSERT raised on EVERY call —
-- not only when a guest listed companions, but on the ordinary empty case too:
--
--   INSERT INTO rsvp_responses (guest_name, companions)
--   VALUES ('רון', COALESCE(NULL::text[], '{}')::text[]);
--   ERROR:  column "companions" is of type jsonb but expression is of type text[]
--
-- Executed on PostgreSQL 16 against this exact column definition, both with
-- names and with none. The 7-argument forwarder PERFORMs the 8-argument body,
-- so both signatures were dead.
--
-- What a guest saw: they tapped אישור הגעה, the RPC raised, submitRSVP threw,
-- and the page showed a generic try-again that could never succeed. Nothing was
-- ever written. The meal and shuttle totals the host orders catering and buses
-- from were empty for the truest of reasons — there were no rows at all.
--
-- The JS tests did not catch it because they mock Supabase and only assert the
-- argument shaping on the client side; nothing exercised the SQL. That is the
-- same shape as the cloudSync mutation result recorded in CLAUDE.md.
--
-- to_jsonb(text[]) is the correct conversion and produces a jsonb array of
-- strings, which is what every reader of this column already expects:
--   to_jsonb(ARRAY['רונית','טל']) -> ["רונית", "טל"]
--
-- While here: bound companions and shuttle_id. Every sibling write path bounds
-- its free-form input and this one bounded neither — with the type error fixed,
-- 500 entries of 10KB each and a 100KB shuttle_id both become reachable. The
-- ceiling matches collab_upsert_by_token exactly (49 entries, 80 chars each),
-- because a row can hold at most 50 seats.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_rsvp_by_token(
  token_value   text,
  guest_name    text,
  phone         text,
  status        text,
  guests_count  int,
  companions    text[],
  shuttle_id    text,
  meal          text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev_id uuid;
  n     int;
  comp  jsonb;
BEGIN
  IF token_value IS NULL OR char_length(token_value) < 8 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT e.id INTO ev_id
    FROM public.events e
   WHERE e.rsvp_token = token_value
   LIMIT 1;

  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  IF COALESCE(trim(guest_name), '') = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  -- Same ceiling submit_guest_by_token uses. A real event does not have 5000
  -- responses; anything past it is someone hammering the endpoint.
  SELECT count(*) INTO n FROM public.rsvp_responses WHERE event_id = ev_id;
  IF n >= 5000 THEN RAISE EXCEPTION 'limit reached'; END IF;

  -- Bounded jsonb array of ≤80-char strings, order preserved so "מלווה 2"
  -- stays the second seat. Identical to collab_upsert_by_token.
  comp := (
    SELECT COALESCE(jsonb_agg(left(COALESCE(elem, ''), 80) ORDER BY ord), '[]'::jsonb)
    FROM unnest(COALESCE(companions, '{}'::text[])) WITH ORDINALITY AS a(elem, ord)
    WHERE ord <= 49
  );

  INSERT INTO public.rsvp_responses
    (event_id, guest_name, phone, attending, guests_count, status, companions, shuttle_id, meal)
  VALUES (
    ev_id,
    left(trim(guest_name), 200),
    nullif(left(trim(COALESCE(phone, '')), 40), ''),
    status = 'yes',
    greatest(0, least(50, COALESCE(guests_count, 1))),
    CASE WHEN status IN ('yes', 'no', 'maybe') THEN status ELSE 'yes' END,
    comp,
    nullif(left(trim(COALESCE(shuttle_id, '')), 64), ''),
    -- Bounded server-side like every other free-form field here. A guest who
    -- is not coming has no meal.
    CASE WHEN status = 'no' THEN NULL
         ELSE nullif(left(trim(COALESCE(meal, '')), 40), '') END
  );
END; $$;

REVOKE ALL ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260814020000_public_endpoint_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Three public endpoints that were missing the bounds every sibling has.
--
-- All three were reproduced as the real `anon` role against a database built
-- from setup_full.sql, not inferred from reading.
-- ============================================================================


-- ── 1. submit_guest_by_token ignored the shared-table off switch ─────────────
--
-- 20260730000001 added collab_is_active(e) to collab_event_by_token,
-- collab_list_by_token, collab_upsert_by_token and collab_delete_by_token, and
-- states the intent plainly: "with the switch off, a holder of the link must
-- not be able to add, change or remove a row." submit_guest_by_token was
-- missed. Measured with collabActive set to false:
--
--   collab_upsert_by_token -> refused: invalid token
--   submit_guest_by_token  -> WROTE. rows in guest_submissions: 1
--
-- The host revokes the link, watches the shared table go quiet, and writes keep
-- landing. Compounding it, `grep -rn submit_guest_by_token src/` returns
-- nothing: no client has called this since the collab table replaced it, and it
-- writes to guest_submissions, which no screen reads.
--
-- So the fix is to take the grant away rather than to add the check. An
-- endpoint nobody calls cannot be hardened into safety; it can only be closed.
-- The function is left in place so that a future caller has to make a
-- deliberate decision about the switch rather than inherit this one.
REVOKE EXECUTE ON FUNCTION public.submit_guest_by_token(text, jsonb) FROM anon, authenticated;


-- ── 2. album_add_photo had no row cap and no input bounds ────────────────────
--
-- Every sibling write path caps an event at 5000 rows and bounds every string
-- (submit_rsvp_by_token, submit_gift_by_token, collab_upsert_by_token). This
-- one did neither. Measured as anon with a valid album token:
--
--   loop ran to completion, never refused
--   album rows: 6002        longest uploader: 5000
--
-- The album QR is meant to be photographed off a table at the venue, so the
-- token reaching a stranger is the DESIGNED distribution, not a breach.
create or replace function public.album_add_photo(
  token_value text, path_value text, uploader_value text
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id  uuid;
  new_id uuid;
  n      int;
begin
  ev_id := public.album_event_id(token_value);
  if ev_id is null then
    raise exception 'invalid album token' using errcode = '42501';
  end if;
  -- Bind the file to its event: the client picks the path, so without this a
  -- caller could index a file belonging to a different event's folder.
  -- The length bound is new; the path is client-supplied and was unbounded.
  if path_value is null or char_length(path_value) > 400
     or path_value not like ev_id::text || '/%' then
    raise exception 'path does not belong to this event' using errcode = '42501';
  end if;

  -- Same ceiling every other public write path on this schema already had.
  select count(*) into n from public.album_photos where event_id = ev_id;
  if n >= 5000 then raise exception 'limit reached' using errcode = '42501'; end if;

  insert into public.album_photos (event_id, album_token, storage_path, uploader)
  values (ev_id, token_value, path_value,
          nullif(left(btrim(coalesce(uploader_value, '')), 80), ''))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.album_add_photo(text, text, text) from public;
grant execute on function public.album_add_photo(text, text, text) to anon, authenticated;


-- ── 3. report_error's rate limit was global, so anyone could blind it ────────
--
-- The ceiling was 200 rows per hour across the WHOLE table, with a 10-minute
-- dedup keyed on (message, route) that varying the message defeats. Measured as
-- anon: 199 junk rows written, and a genuine crash in the same hour recorded 0
-- times. report_error returns void, so the customer's browser believes it
-- reported.
--
-- The owner's only visibility into production crashes is this table, and it
-- would go dark exactly during an event -- which happens once and cannot be
-- re-run. The ceiling is now per route, so flooding one route cannot silence
-- the others, and authenticated sessions keep a reserved quota of their own.
CREATE OR REPLACE FUNCTION public.report_error(
  p_message    text,
  p_stack      text DEFAULT NULL,
  p_route      text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_kind       text DEFAULT 'render'
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_message text := nullif(left(trim(coalesce(p_message, '')), 500), '');
  v_route   text := left(coalesce(p_route, ''), 200);
  v_uid     uuid := auth.uid();
  n         int;
BEGIN
  IF v_message IS NULL THEN RETURN; END IF;

  -- Unchanged: a crash LOOP (the boundary's reload re-crashing) is one error,
  -- not four hundred.
  IF EXISTS (
    SELECT 1 FROM public.error_reports
    WHERE message = v_message
      AND coalesce(route, '') = v_route
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  -- Per ROUTE rather than global, so a flood aimed at one screen can no longer
  -- hide a crash on any other.
  SELECT count(*) INTO n FROM public.error_reports
   WHERE coalesce(route, '') = v_route AND created_at > now() - interval '1 hour';
  IF n >= 50 THEN RETURN; END IF;

  -- And a quota anonymous traffic cannot consume, so a signed-in customer's
  -- crash is still recorded while an anonymous flood is in progress.
  IF v_uid IS NULL THEN
    SELECT count(*) INTO n FROM public.error_reports
     WHERE user_id IS NULL AND created_at > now() - interval '1 hour';
    IF n >= 100 THEN RETURN; END IF;
  END IF;

  INSERT INTO public.error_reports (user_id, message, stack, route, user_agent, kind)
  VALUES (
    v_uid,
    v_message,
    left(coalesce(p_stack, ''), 4000),
    v_route,
    left(coalesce(p_user_agent, ''), 300),
    coalesce(nullif(left(p_kind, 20), ''), 'render')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_error(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.report_error(text, text, text, text, text) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260816000000_event_site_photos.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Event-site photos: move the host's gallery out of the event payload.
--
-- WHY
--
-- The gallery lives inside `eventSite`, and the up-mapper carries `eventSite`
-- whole, so once a host uploads six photos EVERY edit re-uploads all six.
-- Measured (qa/storageSize.mjs): renaming a venue costs 1.13MB, against 0.10MB
-- for the same event without photos, and an evening of seating work is dozens
-- of those writes. The same base64 also sits in localStorage, where one such
-- event is 3.03MB of a ~5MB per-origin budget shared by every event the host
-- has — so a second one breaks saving for ALL of them.
--
-- The floor-plan image is already excluded from the payload for being too
-- large. The gallery beside it is eleven times larger and was not.
--
-- WHY NOT JUST EXCLUDE IT
--
-- The public event site reads the gallery from the cloud. Dropping it from the
-- payload would empty the page guests actually see.
--
-- SHAPE
--
-- Deliberately simpler than the album bucket next to it, because the trust
-- model is different. The album is written by ANONYMOUS guests holding a
-- token, which is why it needs SECURITY DEFINER functions and an index table.
-- This bucket is written only by the signed-in host who owns the event, so
-- plain RLS on storage.objects is sufficient and there is no new table: the
-- URL is stored in the event payload exactly where the base64 used to be, and
-- every consumer already renders it with <img src>.
--
-- Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Bucket. Public read, because the event site is served to guests who are
--    not signed in and hold only a token. 5MB per object: the client downscales
--    to ~150KB, so this is a wide safety margin and a hard stop on video.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-site', 'event-site', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Write access: the host, into a folder named after an event they own.
--
--    `bucket_id = 'event-site'` alone would let any signed-up user write into
--    any event's folder — including overwriting another customer's cover photo.
--    The folder check is what makes the prefix mean something. Same reasoning,
--    and the same shape, as the album policies hardened in
--    20260728000000_public_write_hardening.sql.
drop policy if exists event_site_objects_insert on storage.objects;
create policy event_site_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

-- Replacing a photo at the same path, and removing one the host deleted from
-- the gallery. Without DELETE the bucket only ever grows: a host who swaps
-- their cover photo ten times leaves ten orphans nobody can reach or clean.
drop policy if exists event_site_objects_update on storage.objects;
create policy event_site_objects_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

drop policy if exists event_site_objects_delete on storage.objects;
create policy event_site_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

-- 3. Listing, for the host only, scoped the same way.
--
--    Guests never need this: they load each image by its public URL, which a
--    public bucket serves without consulting any policy. A bucket-wide SELECT
--    would let one signed-up customer enumerate every other customer's photos
--    and harvest event ids in bulk — the exact hole that had to be closed on
--    the album bucket after the fact.
drop policy if exists event_site_objects_select on storage.objects;
create policy event_site_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260816010000_fix_storage_folder_ambiguity.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage policies compared the folder against the EVENT'S NAME, not the file's.
--
-- THE BUG
--
-- Every one of these policies is shaped:
--
--     exists (select 1 from public.events e
--             where e.user_id = auth.uid()
--               and (storage.foldername(name))[1] = e.id::text)
--
-- `name` is unqualified, and inside that subquery the nearest `name` in scope
-- is `public.events.name` — the event's title. So the check computed
-- `storage.foldername('בת המצווה של בגב')`, which has no '/', so foldername
-- returns an empty array and `[1]` is NULL. NULL never equals a uuid, so the
-- predicate was ALWAYS FALSE and every write was refused with
-- "new row violates row-level security policy" — true, and useless.
--
-- Reported as: uploading a photo to the event site fails on a correctly
-- configured project, with the bucket present, all policies present, the path
-- matching the event id exactly, and the signed-in user being the event's
-- owner. All of that was true. The policy simply was not asking what it looked
-- like it was asking.
--
-- WHY IT SURVIVED A POSTGRES REPRODUCTION
--
-- The first reproduction created `public.events` with only `id` and `user_id`.
-- With no `name` column on the inner table, `name` resolved OUTWARD to
-- storage.objects.name — the intended column — and the insert was accepted.
-- The stub passed for the one reason production failed. Fidelity is not a
-- detail: it decided the answer.
--
-- THE FIX
--
-- Qualify it. `storage.objects.name` cannot bind to anything else.
--
-- SCOPE
--
-- This also repairs the ALBUM policies, which carry the identical shape from
-- 20260727000001 and 20260728000000. Their INSERT never used the subquery, so
-- guest uploads always worked — which is exactly why nobody noticed that the
-- host's own SELECT and DELETE on their album objects have never worked.
--
-- Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Event-site bucket ────────────────────────────────────────────────────────

drop policy if exists event_site_objects_insert on storage.objects;
create policy event_site_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

drop policy if exists event_site_objects_update on storage.objects;
create policy event_site_objects_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

drop policy if exists event_site_objects_delete on storage.objects;
create policy event_site_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

drop policy if exists event_site_objects_select on storage.objects;
create policy event_site_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

-- ── Album bucket: the same mistake, older ────────────────────────────────────
--
-- Guests upload through album_add_photo and read through album_list_by_token,
-- neither of which touches these — so the album kept working and hid the fault.
-- What did not work is the host listing or deleting their own album objects.

drop policy if exists album_objects_select on storage.objects;
create policy album_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-album'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

drop policy if exists album_objects_owner_delete on storage.objects;
create policy album_objects_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-album'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260817000000_photo_retention.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Photo retention: an event's photos expire 30 days after the event.
--
-- WHY
--
-- Photos are the only part of an event with real weight. Measured
-- (qa/storageSize.mjs, qa/webpGain.mjs): the event row is ~0.10MB, its photos
-- are ~3.8MB, and a 300-guest event delivers ~0.94GB to guests. Nothing about
-- that is looked at again a month after the party, and on Supabase's Pro plan
-- file storage is 100GB — about four months of accumulation at 500 events a
-- month, after which it is billed forever for photographs nobody opens.
--
-- THE EVENT IS NOT DELETED. The guest list, the seating, the arrivals, the
-- costs, the constraints all stay. Only the objects that cost money go, and
-- only the fields that pointed at them are cleared.
--
-- WHY IT IS SPLIT ACROSS SQL AND AN EDGE FUNCTION
--
-- Deleting the row from storage.objects does NOT free the bytes — the object
-- stays in the backing store and stays on the bill, while becoming unreachable
-- and therefore un-deletable. Freeing it requires the Storage API, which
-- requires the service role, which means a function. So SQL decides WHAT is due
-- and applies the result; the Edge Function does the one thing SQL cannot.
--
-- The split is also what makes this safe to run twice: the function removes the
-- objects, then calls finalize. If it dies in between, the URLs are still in
-- the payload, the event is still due, and the next run removes nothing (the
-- objects are gone) and finalizes normally. Nothing is lost either way.
--
-- Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The retention window, in one place ───────────────────────────────────────
--
-- The client has the same two numbers in src/utils/photoRetention.js, where
-- they drive the warning banner. They are deliberately NOT shared code: the
-- client computes in the host's local calendar and this computes in Postgres,
-- and a shared constant across that boundary would be a false comfort. What
-- keeps them honest is that both sides anchor to the SAME timezone below.

create or replace function public.photo_retention_days()
  returns integer language sql immutable
  as $$ select 30 $$;

comment on function public.photo_retention_days() is
  'Days after the event date at which its photos are deleted. Mirrored by PURGE_AFTER_DAYS in src/utils/photoRetention.js.';

-- ── "Today", in the timezone the customers live in ───────────────────────────
--
-- Postgres defaults to UTC, and the app computes the countdown in the host's
-- local calendar. Left alone, those disagree for three hours every day: the
-- banner says "נמחק היום" while the server still considers the event a day
-- short, or worse, the server purges while the banner still says one day left.
-- Both sides anchor to Israel, which is where every host is.

create or replace function public.photo_retention_today()
  returns date language sql stable
  as $$ select (now() at time zone 'Asia/Jerusalem')::date $$;

-- ── What is due ──────────────────────────────────────────────────────────────
--
-- Returns one row per event that has stored photos and has passed its window,
-- with every object URL that event holds.
--
-- `batch_limit` bounds a single run so a backlog cannot time the function out
-- and then time out again forever. Whatever is left is picked up next run.

create or replace function public.photo_purge_due(batch_limit integer default 200)
returns table (event_id uuid, urls text[])
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    e.id,
    array_agg(u.url)
  from public.events e
  -- Every place an event can hold a photo, flattened. The invitation photo
  -- under `announcements` is the LARGEST object an event has (1400px, q0.82) —
  -- collecting the gallery but not this one would clear the payload, report
  -- the event purged, and strand the heaviest file with its only reference
  -- deleted.
  cross join lateral (
    select e.payload->'eventSite'->>'coverPhoto' as url
    union all
    select jsonb_array_elements_text(
      case when jsonb_typeof(e.payload->'eventSite'->'gallery') = 'array'
           then e.payload->'eventSite'->'gallery' else '[]'::jsonb end)
    union all
    select a.value->>'photo'
    from jsonb_each(
      case when jsonb_typeof(e.payload->'announcements') = 'object'
           then e.payload->'announcements' else '{}'::jsonb end) as a
  ) u
  where
    -- `events.date` is TEXT, not a date — "ISO date string kept as text to
    -- match the app schema exactly". So it is not comparable to a date without
    -- a cast, and the cast is the hazard: the app writes '' for an event whose
    -- date has not been set, and `''::date` RAISES. One such row anywhere in
    -- the table would abort this scan and disable retention for every account,
    -- forever, with nothing but a failed cron run to show for it.
    --
    -- The regex is therefore the filter AND the guard, in that order: it
    -- rejects '' and anything malformed before any cast happens, and it is what
    -- makes "an event with no date is never due" true rather than aspirational.
    -- Guessing a date would delete a real host's photographs on the strength of
    -- a field they never filled in.
    e.date ~ '^\d{4}-\d{2}-\d{2}$'
    -- `<=`, NOT `<`. The client computes the same date as
    -- `eventDate + 30` and calls it the purge day: on day 30 the banner reads
    -- "התמונות נמחקות היום". With `<` the server waits until day 31 and the
    -- host is told their photos are gone while they are still there — the
    -- countdown reaching zero and nothing happening is worse than either
    -- boundary, because it is the one that makes the message a lie. Caught by
    -- qa/photoRetentionSql.mjs, which drives BOTH sides over the same dates and
    -- compares them rather than asserting each separately.
    and e.date::date <= (public.photo_retention_today() - public.photo_retention_days())
    -- A postponement the host asked for outranks the schedule while it lasts.
    -- The regex guard is not decoration: `('garbage')::date` RAISES, and an
    -- exception inside this scan would stop the whole batch — one malformed
    -- value written by any client would disable retention for every account.
    and coalesce(
          case when e.payload->'eventSite'->>'photosKeepUntil' ~ '^\d{4}-\d{2}-\d{2}$'
               then (e.payload->'eventSite'->>'photosKeepUntil')::date end,
          '-infinity'::date
        ) <= public.photo_retention_today()
    -- Only real objects. A legacy base64 photo has nothing behind it to remove,
    -- and an event holding only those must not be reported as having work — it
    -- would be finalized, cleared, and the host would lose photos that were
    -- costing nothing.
    and u.url is not null
    and u.url <> ''
    and u.url not like 'data:%'
  group by e.id
  limit batch_limit
$$;

comment on function public.photo_purge_due(integer) is
  'Events whose photos have passed the retention window, with their object URLs. Service role only.';

-- ── Applying the result ──────────────────────────────────────────────────────
--
-- Called AFTER the objects are gone. Clears the fields that pointed at them and
-- stamps when it happened, so the app can say "התמונות נמחקו" rather than
-- render a row of broken images.

create or replace function public.photo_purge_finalize(ev_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  site jsonb;
  ann  jsonb;
begin
  select
    case when jsonb_typeof(e.payload->'eventSite') = 'object'
         then e.payload->'eventSite' else '{}'::jsonb end,
    case when jsonb_typeof(e.payload->'announcements') = 'object'
         then e.payload->'announcements' else null end
  into site, ann
  from public.events e where e.id = ev_id;

  if not found then return; end if;

  site := site
       || jsonb_build_object('coverPhoto', null)
       || jsonb_build_object('gallery', '[]'::jsonb)
       -- Cleared too: a postponement that has already lapsed would otherwise
       -- sit in the payload forever, and a host who postponed once would see
       -- a stale "kept until" date on an event whose photos are long gone.
       || jsonb_build_object('photosKeepUntil', null)
       || jsonb_build_object('photosPurgedAt',
            to_jsonb(to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD')));

  if ann is not null then
    select jsonb_object_agg(k, v || jsonb_build_object('photo', null))
      into ann
      from jsonb_each(ann) as t(k, v);
  end if;

  update public.events e
  set payload = jsonb_set(
        case when ann is null then e.payload
             else jsonb_set(e.payload, '{announcements}', ann) end,
        '{eventSite}', site)
        -- THE PAYLOAD'S OWN updatedAt, not just the column.
        --
        -- mapCloudEventToLocalEvent reads `updatedAt` out of the PAYLOAD, and
        -- mergeCloudWithLocal gives the whole `eventSite` object to whichever
        -- side's updatedAt is newer. Bumping only the column — which is what
        -- every other definer function in this schema does, correctly, because
        -- they all touch collections that are merged row-by-row — would leave
        -- any host with an older local copy winning the merge and pushing the
        -- deleted URLs straight back into the cloud. The photos would be gone
        -- and the event would point at them forever.
        || jsonb_build_object('updatedAt', (extract(epoch from now()) * 1000)::bigint),
      -- Bump the version so an open tab's next optimistic push conflicts and
      -- re-pulls instead of silently overwriting the purge.
      version    = coalesce(e.version, 1) + 1,
      updated_at = now()
  where e.id = ev_id;
end;
$$;

comment on function public.photo_purge_finalize(uuid) is
  'Clears an event''s photo fields after its objects have been removed from Storage. Service role only.';

-- ── Reachability ─────────────────────────────────────────────────────────────
--
-- Neither of these is for customers. `photo_purge_due` reads across every
-- account's payload, and `photo_purge_finalize` deletes fields without checking
-- ownership — both are SECURITY DEFINER, so a stray GRANT to `authenticated`
-- would hand any signed-up user a cross-tenant read and a cross-tenant wipe.
-- The default EXECUTE grant to PUBLIC is revoked explicitly rather than assumed.

revoke all on function public.photo_purge_due(integer)   from public, anon, authenticated;
revoke all on function public.photo_purge_finalize(uuid) from public, anon, authenticated;
grant execute on function public.photo_purge_due(integer)   to service_role;
grant execute on function public.photo_purge_finalize(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260818000000_profiles_pin_billing_columns.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles: users can no longer rewrite their own billing identity
--
-- THE HOLE. `profiles: users update own` (20260524000000) was written before
-- billing existed and pins exactly two columns in its WITH CHECK:
--
--     WITH CHECK (id = auth.uid()
--                 AND role = (SELECT p.role FROM public.profiles p
--                             WHERE p.id = auth.uid()))
--
-- `stripe_customer_id` was added four migrations later (20260524000004) with a
-- UNIQUE constraint and no policy of its own, so it fell straight through that
-- check — as does `email`. Both are user-writable from the browser today.
--
-- Why that matters, precisely:
--
--   • create-billing-portal reads `profiles.stripe_customer_id` for the caller
--     and hands it to `stripe.billingPortal.sessions.create({ customer })`
--     verbatim. A signed-up user who set that column to somebody else's `cus_…`
--     gets a genuine Stripe portal for the victim: invoices with billing name
--     and address, card last-4, and the power to cancel their subscription.
--   • create-checkout-session seeds the Stripe customer from `profiles.email`.
--   • The column is UNIQUE, so squatting an id makes the real owner's webhook
--     write fail — a quiet billing denial of service.
--
-- NOT exploitable today: billing is switched off (no publishable key, so the UI
-- hides) and the app never exposes a `cus_…` anywhere. This is closed BEFORE
-- checklist item 41 turns the keys on, which is the whole point — a hole like
-- this is invisible on the day it stops being theoretical.
--
-- Both columns stay writable by the SERVICE ROLE, which is what the Edge
-- Functions use and what legitimately sets them.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "profiles: users update own" on public.profiles;

create policy "profiles: users update own"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Every column below is compared to its CURRENT stored value, so an UPDATE
    -- that leaves it alone passes and one that changes it is refused. Listing
    -- them by name rather than by exclusion is deliberate: a column added later
    -- must be considered on purpose, which is exactly what did not happen to
    -- stripe_customer_id.
    and role = (
      select p.role from public.profiles p where p.id = auth.uid()
    )
    and stripe_customer_id is not distinct from (
      select p.stripe_customer_id from public.profiles p where p.id = auth.uid()
    )
    and email is not distinct from (
      select p.email from public.profiles p where p.id = auth.uid()
    )
  );

comment on policy "profiles: users update own" on public.profiles is
  'A user may edit their own profile except role, email and stripe_customer_id. '
  'The last two feed the Stripe Edge Functions directly; see 20260818000000.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260818000100_album_objects_cap.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- event-album: an anonymous upload is bounded per event
--
-- THE HOLE. `album_objects_insert` (20260728000000) grants INSERT on
-- storage.objects to `anon` with one test: is the first path segment a real
-- event id?
--
--     with check (bucket_id = 'event-album'
--                 and public.album_folder_is_event((storage.foldername(name))[1]))
--
-- No token, no ceiling. And the event id is not a secret from anyone holding
-- ANY public link: `public_event_by_token` returns `'id', e.id`. So any guest
-- who was sent the RSVP, gift, invitation or album link — or anyone they
-- forwarded it to — could PUT 10MB images into that folder in a loop, straight
-- onto the storage bill.
--
-- The 5000-row cap added in 20260814020000 bounds `album_photos`, the INDEX.
-- It does not bound `storage.objects`, where the bytes actually live. The two
-- were never connected: `album_add_photo` writes the row, the client PUTs the
-- object, and only the first had a limit.
--
-- 20260727000001 recorded this as accepted residual risk. Re-ranked now that
-- there is a paying customer and a storage bill with a name on it.
--
-- THE CAP. Same number as the sibling row cap, deliberately — two different
-- limits on two halves of one operation is how they drift. 5000 objects at the
-- bucket's 10MB ceiling is the worst case; a real 300-guest wedding uploading
-- ten photos each is 3000, so this does not touch normal use.
--
-- WHAT THIS IS NOT. It is not per-uploader and it is not authentication: one
-- determined guest can still fill an event's 5000 slots. It converts unbounded
-- into bounded, which is the difference between "a storage bill" and "one
-- event's album is spoiled". Real per-guest limiting needs the album token to
-- reach storage RLS, which it cannot today.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.album_folder_has_room(folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- `< 5000`, so the 5000th object is accepted and the 5001st is not.
  select (
    select count(*) from storage.objects o
    where o.bucket_id = 'event-album'
      and (storage.foldername(o.name))[1] = folder
  ) < 5000;
$$;

revoke all on function public.album_folder_has_room(text) from public;
grant execute on function public.album_folder_has_room(text) to anon, authenticated;

drop policy if exists album_objects_insert on storage.objects;
create policy album_objects_insert
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'event-album'
    and public.album_folder_is_event((storage.foldername(name))[1])
    and public.album_folder_has_room((storage.foldername(name))[1])
  );

comment on function public.album_folder_has_room(text) is
  'Is this event album under its 5000-object ceiling? Guards the anonymous '
  'INSERT policy on storage.objects; see 20260818000100.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 20260818000200_drop_payment_fields_from_public_event.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- public_event_by_token: stop broadcasting the host's payment details
--
-- THE LEAK. 20260728000000 carefully gated the sibling tokens per token type —
-- the album QR must not also unlock RSVP — and left these two OUTSIDE the CASE:
--
--     'bit_phone', e.payload->>'giftBitPhone',
--     'paybox_link', e.payload->>'giftPayboxLink',
--
-- So every token type received them: `album` and `hostess` included. The album
-- QR is designed to be photographed off a table in the hall by strangers, and
-- it was handing out the host's personal Bit number and PayBox link.
--
-- AND NOTHING EVER RENDERED THEM. Grepped the whole client: `publicTokens.js`
-- mapped them into its return value and no screen read the result.
-- `GiftScreen` states outright why (11.8) — "a peer-to-peer transfer app
-- charges the HOST the fee on money the product just collected on their
-- behalf" — so the gift page deliberately has no Bit/PayBox route. The only
-- other mention is a demo fixture.
--
-- A field that nothing displays and everything receives is the easiest kind of
-- leak to justify closing: this removes them outright rather than adding a
-- fourth entry to the CASE. The values stay in `events.payload`, so the host's
-- own copy and the cloud round-trip are untouched — this is only about what an
-- anonymous token holder is handed.
--
-- IF THEY ARE EVER NEEDED AGAIN, put them INSIDE the CASE:
--     'bit_phone', case when token_type = 'gift' then e.payload->>'giftBitPhone' end
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
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

comment on function public.public_event_by_token(text, text) is
  'Public event data for one token. Serves no payment details: see 20260818000200.';
