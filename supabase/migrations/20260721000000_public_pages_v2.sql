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
    'owner_name',        e.payload->>'ownerName'
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
