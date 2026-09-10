-- =============================================================================
--  Rebrand — app_settings.product_name
--  Checklist 11. Runs after 20260818000300.
-- =============================================================================
--
--  WHAT THIS IS FOR
--  The brand name was decided on 30.8: "רוויה". Everywhere the product renders
--  it, it now reads COMPANY.name from src/data/company.js — one source, and a
--  test that fails if anyone spells it out again.
--
--  The database is the one place that change cannot reach. `app_settings` was
--  created by 20260524000002 with the old name as BOTH a column default and a
--  seeded value, and that row is what the admin Settings screen loads and
--  displays. Without this migration the admin panel keeps showing a brand that
--  no longer exists anywhere else in the product.
--
--  WHY NOT EDIT THE ORIGINAL MIGRATION
--  20260524000002 has already run in production. A migration that has run is
--  history — editing it changes what a fresh database gets while leaving the
--  live one untouched, which is precisely how setup_full.sql fell seven
--  migrations behind and came up with holes nobody could see. New file, always.
--
--  SAFE TO RE-RUN. Both statements are idempotent, and the UPDATE deliberately
--  touches ONLY rows still holding the old string — if an operator has already
--  typed a different name into the Settings screen, that is a real choice and
--  this migration must not overwrite it.
-- =============================================================================

-- 1. The column default, for any future row.
ALTER TABLE public.app_settings
  ALTER COLUMN product_name SET DEFAULT 'רוויה';

-- 2. The seeded singleton the admin screen actually reads.
UPDATE public.app_settings
   SET product_name = 'רוויה'
 WHERE product_name = 'כוכב השולחן';

-- Verify (expects one row, product_name = 'רוויה'):
--   SELECT id, product_name FROM public.app_settings;
