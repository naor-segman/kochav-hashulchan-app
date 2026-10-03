-- =============================================================================
--  Rebrand — app_settings.product_name → "Unica Plan"
--  WORKPLAN 128 (owner, 3.10). Runs after 20261001000000.
-- =============================================================================
--
--  WHAT THIS IS FOR
--  The product is renamed "Unica Plan" (English only, everywhere). The app
--  reads COMPANY.name from src/data/company.js; the database is the one place
--  that change cannot reach. `app_settings.product_name` is what the admin
--  Settings screen loads, seeded "רוויה" by 20260830000000.
--
--  New file rather than an edit: 20260830000000 has run in production, and a
--  migration that has run is history (see that file's own note).
--
--  SAFE TO RE-RUN. The UPDATE touches ONLY rows still holding a former name —
--  a name an operator typed into the Settings screen is a real choice and is
--  not overwritten.
-- =============================================================================

-- 1. The column default, for any future row.
ALTER TABLE public.app_settings
  ALTER COLUMN product_name SET DEFAULT 'Unica Plan';

-- 2. The seeded singleton the admin screen actually reads.
UPDATE public.app_settings
   SET product_name = 'Unica Plan'
 WHERE product_name IN ('רוויה', 'כוכב השולחן');

-- Verify (expects one row, product_name = 'Unica Plan'):
--   SELECT id, product_name FROM public.app_settings;
