-- =============================================================================
-- Migration: 20260928000700_hostess_three_way_arrival
-- Depends on: 20260813000000_arrival_timestamps
--
-- WORKPLAN ג2: two greeters marking the SAME family inside one 25-second
-- refresh window lost a mark. Each sent the full seat list it believed in, and
-- the last write replaced the row: greeter A ticks seat 1, greeter B (still
-- looking at the old list) ticks seat 2, and the family ends with seat 2 only.
--
-- This overload takes a fourth argument, `base` — the seat list the greeter's
-- screen showed BEFORE the tap. The server applies only the difference:
--
--     result = (current ∪ (seats − base)) − (base − seats)
--
-- so B's tick adds seat 2 to whatever is there now, and an un-tick removes
-- only the seat that was un-ticked. The 3-argument version is left in place
-- untouched, so a phone still running the old page keeps working exactly as
-- before.
--
-- Same guards as the original: the hostess token, the writes switch, the
-- row's own seat count as the ceiling, integers only. Verified against a real
-- Postgres by qa/hostessThreeWaySql.mjs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hostess_mark_arrival_by_token(
  token_value text,
  guest_id    text,
  seats       jsonb,
  base        jsonb
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ev_id      uuid;
  seat_count int;
  want       int[];
  was        int[];
  cur        int[];
  added      int[];
  removed    int[];
  result     jsonb;
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

  SELECT greatest(1, COALESCE((g->>'count')::int, 1))
    INTO seat_count
  FROM public.events e,
       jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g
  WHERE e.id = ev_id AND g->>'id' = guest_id
  LIMIT 1;
  IF seat_count IS NULL THEN RAISE EXCEPTION 'guest not found'; END IF;

  -- Three seat sets, each sanitised the same way as the original function:
  -- integers only (the regex inside the CASE, see 20260813000000), inside
  -- [0, seat_count), deduplicated.
  SELECT COALESCE(array_agg(DISTINCT v), '{}') INTO want FROM (
    SELECT CASE WHEN x ~ '^[0-9]{1,3}$' THEN x::int END AS v
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(seats) = 'array' THEN seats ELSE '[]'::jsonb END) AS x
  ) s WHERE v >= 0 AND v < seat_count;

  SELECT COALESCE(array_agg(DISTINCT v), '{}') INTO was FROM (
    SELECT CASE WHEN x ~ '^[0-9]{1,3}$' THEN x::int END AS v
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(base) = 'array' THEN base ELSE '[]'::jsonb END) AS x
  ) s WHERE v >= 0 AND v < seat_count;

  SELECT COALESCE(array_agg(DISTINCT v), '{}') INTO cur FROM (
    SELECT CASE WHEN x ~ '^[0-9]{1,3}$' THEN x::int END AS v
    FROM public.events e,
         jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb)) g,
         jsonb_array_elements_text(CASE WHEN jsonb_typeof(g->'arrivedSeats') = 'array'
                                        THEN g->'arrivedSeats' ELSE '[]'::jsonb END) AS x
    WHERE e.id = ev_id AND g->>'id' = guest_id
  ) s WHERE v >= 0 AND v < seat_count;

  -- The two differences first, each on its own — EXCEPT chains associate to
  -- the left, so writing them inline would compute the wrong set.
  added   := ARRAY(SELECT unnest(want) EXCEPT SELECT unnest(was));
  removed := ARRAY(SELECT unnest(was)  EXCEPT SELECT unnest(want));

  -- (current ∪ added) − removed, as a sorted JSON array.
  SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) INTO result FROM (
    SELECT DISTINCT v FROM unnest(cur || added) AS v
    WHERE NOT (v = ANY (removed))
  ) s;

  stamp_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  UPDATE public.events e
  SET payload = jsonb_set(
        e.payload,
        '{guests}',
        COALESCE((
          SELECT jsonb_agg(
            CASE WHEN t.g->>'id' = guest_id
              THEN t.g
                   || jsonb_build_object('arrivedSeats', result)
                   || jsonb_build_object('arrived', to_jsonb(jsonb_array_length(result) > 0))
                   || jsonb_build_object('arrivedAt', to_jsonb(stamp_ms))
              ELSE t.g
            END
            ORDER BY t.ord
          )
          FROM jsonb_array_elements(COALESCE(e.payload->'guests', '[]'::jsonb))
               WITH ORDINALITY AS t(g, ord)
        ), '[]'::jsonb)
      ),
      version    = COALESCE(e.version, 1) + 1,
      updated_at = now()
  WHERE e.id = ev_id;
END;
$$;

REVOKE ALL ON FUNCTION public.hostess_mark_arrival_by_token(text, text, jsonb, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hostess_mark_arrival_by_token(text, text, jsonb, jsonb) TO anon, authenticated;
