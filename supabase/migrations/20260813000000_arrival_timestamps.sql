-- ─────────────────────────────────────────────────────────────────────────────
-- A timestamp on every arrival, so two people marking the same list can be
-- told apart.
--
-- THE BUG THIS FIXES (found by the data-integrity review, 12.8)
-- Arrivals are the only field on a guest row written by SOMEONE ELSE, from a
-- device the host's tab never sees: the greeter, through the entrance token.
-- The client merge asked "has the local copy expressed an opinion about this
-- guest?" and kept the local value if so. That question cannot distinguish a
-- local opinion from a value the client COPIED FROM THE CLOUD a minute earlier
-- — so after the first merge, the local copy was never silent again and every
-- later cloud update for that row was dropped, then pushed back over the cloud.
--
-- Measured, before the fix:
--   after wave 1 merge, local arrivedSeats = [0]
--   cloud arrivedSeats after wave 2        = [0,1]
--   after wave 2 merge, local arrivedSeats = [0]
--   cloud after the host's next push       = [0]      <-- seat 1 lost
--
-- In the hall that is a family arriving in two cars, or a greeter correcting
-- "2 of 4" to "3 of 4" and watching it revert.
--
-- THE FIX: whoever wrote LAST wins. That is the only question about arrivals
-- with a correct answer, because the two writers are two different people and
-- neither is authoritative over the other. It needs a timestamp on the row, and
-- the greeter's write happens HERE, in the database, so the database has to
-- stamp it. The client stamps its own writes in src/utils/arrival.js
-- (withArrivedSeats), which is the single choke point for all of them.
--
-- Epoch MILLISECONDS, to match JavaScript's Date.now() on the other side — a
-- seconds-based timestamp would compare as "always older" against every client
-- value and hand the host permanent priority, which is the bug again with the
-- sign flipped.
--
-- WHY THIS IS ALSO A FULL REDEFINITION
-- Postgres does not merge function bodies. The definition below is the CURRENT
-- one from 20260811000000_entrance_scoped_writes.sql, carried over line for
-- line — the active-switch guard, the ≥8-char token check, the seat-count
-- ceiling, the regex-inside-the-CASE guard and the version bump — with
-- `arrivedAt` added and nothing else changed. If you are writing the next
-- migration that touches this function: copy from here, not from an older file.
-- (Doing the opposite is how companion support was silently reverted once
-- already — see 20260811010000_collab_companions_restore.sql.)
--
-- Idempotent: safe to run more than once. Adds no column — `arrivedAt` lives
-- inside the guest object in `payload`, exactly like `arrivedSeats`.
-- ─────────────────────────────────────────────────────────────────────────────

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
  stamp_ms   bigint;
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

  -- Milliseconds since the epoch, the same unit Date.now() produces. Taken once
  -- so every guest touched in one call carries the identical stamp.
  stamp_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

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
                   || jsonb_build_object('arrivedAt', to_jsonb(stamp_ms))
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
