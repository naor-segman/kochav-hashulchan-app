-- ─────────────────────────────────────────────────────────────────────────────
-- עמדת כניסה — the entrance link stops being read-only.
--
-- The hostess token could only VIEW. So at a real event the greeter was handed
-- the OWNER'S ACCOUNT to mark arrivals — the one credential that can also read
-- every phone number, edit the guest list, and delete the event. That is unsafe
-- and impractical, and it is what actually happened.
--
-- This migration gives the same token exactly ONE write: which people of one
-- guest row are physically in the room. It cannot add a guest, cannot move
-- anyone between tables, cannot read a phone number, cannot touch gifts. Not
-- because the client declines to offer those — a token holder can call any RPC
-- directly with curl — but because this is the only write function the token
-- opens, and it touches exactly two keys on one row.
--
-- Shape copied deliberately from 20260730000001_collab_active_switch.sql:
-- SECURITY DEFINER keyed on the token, every field length-bounded server-side,
-- and an on/off switch read from payload->>'hostessWriteActive' so the host can
-- close the door link after the event without invalidating the URL the greeter
-- already has.
--
-- Default is ON. Absent means open, exactly as `collabActive` behaves, because
-- the failure mode of defaulting to closed is that the next event repeats the
-- one this fixes: the greeter opens the link, it does nothing, and nobody knows
-- why. Only an explicit "false" closes it.
--
-- ARRIVAL IS PER-PERSON. A guest row is a GROUP — `count` people, `companions`
-- names. `arrived` was one boolean for the whole row, so marking the aunt
-- marked her husband and three children with her. The canonical field is now
-- `arrivedSeats`: an array of seat indices. `arrived` is still written, as
-- "somebody from this row is here", so every existing reader keeps working.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The switch ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hostess_writes_active(e public.events)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(e.payload->>'hostessWriteActive', 'true') <> 'false';
$$;

-- ── Read ─────────────────────────────────────────────────────────────────────
-- Replaces the version in 20260723000001_companions.sql. Three additions, each
-- for a thing the screen could not do without it:
--   arrivedSeats — otherwise the greeter's phone shows everyone as not-arrived
--                  and she re-marks people who are already inside;
--   capacity/shape — the table glyph on this screen was already being rendered
--                  with `shape` and `capacity` that this function never
--                  returned, so it drew a default-shaped, zero-capacity table
--                  on every chip;
--   writes_open  — so the UI can say "the host has closed marking" instead of
--                  failing silently on every tap.
-- Phone numbers are still absent. That has not changed and must not.
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
        'id',           g->>'id',
        'name',         g->>'name',
        'count',        COALESCE((g->>'count')::int, 1),
        'companions',   COALESCE(g->'companions', '[]'::jsonb),
        'rsvp',         g->>'rsvp',
        'arrived',      COALESCE((g->>'arrived')::boolean, false),
        'arrivedSeats', COALESCE(g->'arrivedSeats', 'null'::jsonb)
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
    ), '[]'::jsonb),
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',       t->>'id',
        'name',     t->>'name',
        'capacity', COALESCE((t->>'capacity')::int, 0),
        'shape',    t->>'shape'
      ))
      FROM jsonb_array_elements(COALESCE(e.payload->'tables', '[]'::jsonb)) t
    ), '[]'::jsonb),
    'seating',     COALESCE(e.payload->'seating', '{}'::jsonb),
    'writes_open', public.hostess_writes_active(e)
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.hostess_data_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_data_by_token(text) TO anon, authenticated;

-- ── The one write ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hostess_mark_arrival_by_token(
  token_value text,
  guest_id    text,
  seats       jsonb
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ev_id      uuid;
  seat_count int;
  clean      jsonb;
BEGIN
  SELECT e.id INTO ev_id
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.hostess_token = token_value
    AND public.hostess_writes_active(e)
  LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  IF guest_id IS NULL OR char_length(guest_id) = 0 OR char_length(guest_id) > 64 THEN
    RAISE EXCEPTION 'guest id required';
  END IF;

  -- The row's own seat count is the ceiling. A caller cannot invent seats for
  -- a party of two and inflate the number the host gives the caterer.
  SELECT greatest(1, COALESCE((g->>'count')::int, 1))
    INTO seat_count
  FROM public.events e,
       jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
  WHERE e.id = ev_id AND g->>'id' = guest_id
  LIMIT 1;
  IF seat_count IS NULL THEN RAISE EXCEPTION 'guest not found'; END IF;

  -- Deduped, sorted, integers only, inside [0, seat_count).
  --
  -- The regex is inside the CASE, not in a WHERE beside the cast: Postgres does
  -- not promise to evaluate a subquery's WHERE before its select list, and is
  -- free to push the cast down — so `["abc"]` would raise "invalid input syntax
  -- for type integer" instead of being quietly ignored, which is the exact
  -- failure this guard exists to prevent. Non-matching entries become NULL, and
  -- the outer predicate drops them (NULL >= 0 is NULL, not true).
  SELECT COALESCE(jsonb_agg(DISTINCT v ORDER BY v), '[]'::jsonb)
    INTO clean
  FROM (
    SELECT CASE WHEN x ~ '^[0-9]{1,3}$' THEN x::int END AS v
    FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(seats) = 'array' THEN seats ELSE '[]'::jsonb END
         ) AS x
  ) s
  WHERE v >= 0 AND v < seat_count;

  UPDATE public.events e
  SET payload = jsonb_set(
        e.payload,
        '{guests}',
        COALESCE((
          SELECT jsonb_agg(
            CASE WHEN t.g->>'id' = guest_id
              THEN t.g
                   || jsonb_build_object('arrivedSeats', clean)
                   || jsonb_build_object('arrived', to_jsonb(jsonb_array_length(clean) > 0))
              ELSE t.g
            END
            ORDER BY t.ord
          )
          FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb))
               WITH ORDINALITY AS t(g, ord)
        ), '[]'::jsonb)
      ),
      -- Bump the version so the owner's next optimistic push conflicts and
      -- re-pulls instead of silently overwriting arrivals marked at the door.
      version    = COALESCE(e.version, 1) + 1,
      updated_at = now()
  WHERE e.id = ev_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hostess_mark_arrival_by_token(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.hostess_mark_arrival_by_token(text, text, jsonb) TO anon, authenticated;
