-- ── The meal question moves to the person who knows the answer ──────────────
--
-- `meal` was settable ONLY on the host's guest list. So the host — who at that
-- point has not spoken to anyone — was guessing who is vegan, and the RSVP form
-- the guest actually fills in never asked. That is the wrong way round, and it
-- is the thing the owner named after running a real event: "אין להם מושג מי
-- יגיע, מה הוא רוצה אם הוא טבעוני… את כל הפרטים האלו מי שממלא זה האורח".
--
-- The choice rides along on the RSVP the guest is already submitting — one
-- form, one submission — exactly as `shuttle_id` does. Values are the keys from
-- MEAL_OPTIONS in src/data/constants.js. Free-form text, not an enum: the
-- option list lives in the client and a host who later removes an option must
-- not break rows already stored. An unrecognised value simply stops resolving
-- to a label.
--
-- Idempotent — safe to run more than once.

ALTER TABLE public.rsvp_responses
  ADD COLUMN IF NOT EXISTS meal text;

COMMENT ON COLUMN public.rsvp_responses.meal IS
  'Optional MEAL_OPTIONS key the guest chose (regular/kosher/vegan/vegetarian/child/none). Free-form: the option list lives in the client.';

-- The existing RLS policies on rsvp_responses scope by event ownership and
-- grant the ROW, not a column list, so the new column needs no policy.

-- ── The write path ──────────────────────────────────────────────────────────
-- A new 8-argument function. The 7-argument one is NOT dropped — it is
-- redefined below as a thin forwarder, because the service worker can serve a
-- cached build for days after a deploy and a guest on that build still calls
-- the 7-argument signature. Dropping it would turn "I clicked אישור הגעה" into
-- a permanent failure for exactly the people who already responded once.
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

  INSERT INTO public.rsvp_responses
    (event_id, guest_name, phone, attending, guests_count, status, companions, shuttle_id, meal)
  VALUES (
    ev_id,
    left(trim(guest_name), 200),
    nullif(left(trim(COALESCE(phone, '')), 40), ''),
    status = 'yes',
    greatest(0, least(50, COALESCE(guests_count, 1))),
    CASE WHEN status IN ('yes', 'no', 'maybe') THEN status ELSE 'yes' END,
    COALESCE(companions, '{}')::text[],
    nullif(trim(COALESCE(shuttle_id, '')), ''),
    -- Bounded server-side like every other free-form field here. A guest who
    -- is not coming has no meal.
    CASE WHEN status = 'no' THEN NULL
         ELSE nullif(left(trim(COALESCE(meal, '')), 40), '') END
  );
END; $$;

REVOKE ALL ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) TO anon, authenticated;

-- ── The old signature, kept alive as a forwarder ────────────────────────────
-- Same 7 arguments, same behaviour, meal NULL. Two functions with different
-- argument counts are not ambiguous to PostgREST, which resolves by the exact
-- set of argument NAMES it is given.
CREATE OR REPLACE FUNCTION public.submit_rsvp_by_token(
  token_value   text,
  guest_name    text,
  phone         text,
  status        text,
  guests_count  int,
  companions    text[],
  shuttle_id    text
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.submit_rsvp_by_token(
    token_value, guest_name, phone, status, guests_count, companions, shuttle_id, NULL);
END; $$;

REVOKE ALL ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_rsvp_by_token(text, text, text, text, int, text[], text) TO anon, authenticated;
