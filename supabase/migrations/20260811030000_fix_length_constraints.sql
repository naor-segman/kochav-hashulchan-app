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
