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

COMMENT ON COLUMN public.templates.icon       IS 'Emoji or symbol shown in the UI, e.g. "💍" or "✦".';
COMMENT ON COLUMN public.templates.sort_order IS 'Ascending display order for template pickers. Lower = earlier.';

-- Index so ORDER BY sort_order, created_at is efficient even on large template sets.
CREATE INDEX IF NOT EXISTS templates_sort_order_idx
  ON public.templates (sort_order ASC, created_at ASC);
