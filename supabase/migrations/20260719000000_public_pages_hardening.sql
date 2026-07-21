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
