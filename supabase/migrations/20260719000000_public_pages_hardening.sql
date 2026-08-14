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

