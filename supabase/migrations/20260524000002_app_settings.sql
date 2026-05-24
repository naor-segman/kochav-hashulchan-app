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
