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
