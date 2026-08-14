-- ============================================================================
-- submit_rsvp_by_token — every RSVP submission was failing at the database
--
-- rsvp_responses.companions is jsonb (20260723000001_companions.sql:8), and the
-- function inserted `COALESCE(companions,'{}')::text[]` into it. PostgreSQL has
-- no assignment cast from text[] to jsonb, so the INSERT raised on EVERY call —
-- not only when a guest listed companions, but on the ordinary empty case too:
--
--   INSERT INTO rsvp_responses (guest_name, companions)
--   VALUES ('רון', COALESCE(NULL::text[], '{}')::text[]);
--   ERROR:  column "companions" is of type jsonb but expression is of type text[]
--
-- Executed on PostgreSQL 16 against this exact column definition, both with
-- names and with none. The 7-argument forwarder PERFORMs the 8-argument body,
-- so both signatures were dead.
--
-- What a guest saw: they tapped אישור הגעה, the RPC raised, submitRSVP threw,
-- and the page showed a generic try-again that could never succeed. Nothing was
-- ever written. The meal and shuttle totals the host orders catering and buses
-- from were empty for the truest of reasons — there were no rows at all.
--
-- The JS tests did not catch it because they mock Supabase and only assert the
-- argument shaping on the client side; nothing exercised the SQL. That is the
-- same shape as the cloudSync mutation result recorded in CLAUDE.md.
--
-- to_jsonb(text[]) is the correct conversion and produces a jsonb array of
-- strings, which is what every reader of this column already expects:
--   to_jsonb(ARRAY['רונית','טל']) -> ["רונית", "טל"]
--
-- While here: bound companions and shuttle_id. Every sibling write path bounds
-- its free-form input and this one bounded neither — with the type error fixed,
-- 500 entries of 10KB each and a 100KB shuttle_id both become reachable. The
-- ceiling matches collab_upsert_by_token exactly (49 entries, 80 chars each),
-- because a row can hold at most 50 seats.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_rsvp_by_token(
  token_value   text,
  guest_name    text,
  phone         text,
  status        text,
  guests_count  int,
  companions    text[],
  shuttle_id    text,
  meal          text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev_id uuid;
  n     int;
  comp  jsonb;
BEGIN
  IF token_value IS NULL OR char_length(token_value) < 8 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT e.id INTO ev_id
    FROM public.events e
   WHERE e.rsvp_token = token_value
   LIMIT 1;

  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  IF COALESCE(trim(guest_name), '') = '' THEN
    RAISE EXCEPTION 'name required';
  END IF;

  -- Same ceiling submit_guest_by_token uses. A real event does not have 5000
  -- responses; anything past it is someone hammering the endpoint.
  SELECT count(*) INTO n FROM public.rsvp_responses WHERE event_id = ev_id;
  IF n >= 5000 THEN RAISE EXCEPTION 'limit reached'; END IF;

  -- Bounded jsonb array of ≤80-char strings, order preserved so "מלווה 2"
  -- stays the second seat. Identical to collab_upsert_by_token.
  comp := (
    SELECT COALESCE(jsonb_agg(left(COALESCE(elem, ''), 80) ORDER BY ord), '[]'::jsonb)
    FROM unnest(COALESCE(companions, '{}'::text[])) WITH ORDINALITY AS a(elem, ord)
    WHERE ord <= 49
  );

  INSERT INTO public.rsvp_responses
    (event_id, guest_name, phone, attending, guests_count, status, companions, shuttle_id, meal)
  VALUES (
    ev_id,
    left(trim(guest_name), 200),
    nullif(left(trim(COALESCE(phone, '')), 40), ''),
    status = 'yes',
    greatest(0, least(50, COALESCE(guests_count, 1))),
    CASE WHEN status IN ('yes', 'no', 'maybe') THEN status ELSE 'yes' END,
    comp,
    nullif(left(trim(COALESCE(shuttle_id, '')), 64), ''),
    -- Bounded server-side like every other free-form field here. A guest who
    -- is not coming has no meal.
    CASE WHEN status = 'no' THEN NULL
         ELSE nullif(left(trim(COALESCE(meal, '')), 40), '') END
  );
END; $$;

REVOKE ALL ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) TO anon, authenticated;
