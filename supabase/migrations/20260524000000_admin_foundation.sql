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
--   WHERE  email = 'YOUR_EMAIL';   -- e.g. 'naor.segman@gmail.com'
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
--   WHERE  email = 'YOUR_EMAIL';   -- e.g. 'naor.segman@gmail.com'
--
-- You only need to do this once. All subsequent logins will detect admin role.
-- =============================================================================
