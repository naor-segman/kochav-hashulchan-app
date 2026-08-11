-- ─────────────────────────────────────────────────────────────────────────────
-- RESTORE: companion names on the shared collaborative table.
--
-- THE BUG (found 11.8, after a real event):
--   "מילאתי אורח עם 8 מלווים וכל השמות. זה מסתנכרן לעמוד אורחים. כשאני עורך,
--    זה נותן לי את הפרטים של האדם הראשי אבל מוחק את כל שמות המלווים."
--
-- 20260725000000_collab_companions.sql taught both token RPCs about the
-- `companions` column. Five days later 20260730000001_collab_active_switch.sql
-- added the on/off switch by doing CREATE OR REPLACE on the SAME two functions
-- — copied from the pre-companions version. Postgres does not merge function
-- bodies: the later file simply won the definition, and the companions support
-- was silently reverted in every database built or updated from it (including
-- setup_full.sql, whose last definition of these two functions is the broken
-- one).
--
-- What that cost, exactly:
--   * collab_upsert_by_token no longer wrote `companions` at all — not on
--     INSERT (which fell back to the '[]' default) and not in the ON CONFLICT
--     update. Every companion name a relative typed into the shared table was
--     discarded at the database.
--   * collab_list_by_token no longer returned `companions`, so on the next
--     load the shared table rendered every companion input blank — the exact
--     "it deletes all the companion names" the owner saw.
--   * The owner's app reads the table directly (RLS, not the RPC) and DOES
--     select companions, so it received '[]' and mirrored that emptiness into
--     the guest list, wiping names that had been typed in the app too.
--
-- This restores the companions handling ON TOP of the active-switch guard, so
-- both properties hold at once. Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- The column is created by 20260725000000; repeated here so this file can be
-- applied to a database that somehow missed it.
ALTER TABLE public.collab_guests
  ADD COLUMN IF NOT EXISTS companions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── List the rows: companions come back ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.collab_list_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           g.id,
    'name',         g.name,
    'phone',        g.phone,
    'side',         g.side,
    'guest_group',  g.guest_group,
    'guests_count', g.guests_count,
    'companions',   COALESCE(g.companions, '[]'::jsonb),
    'updated_at',   g.updated_at,
    'updated_by',   g.updated_by
  ) ORDER BY g.updated_at DESC), '[]'::jsonb)
  FROM public.collab_guests g
  JOIN public.events e ON e.id = g.event_id
  WHERE e.collab_token = token_value
    AND char_length(token_value) >= 8
    AND public.collab_is_active(e);
$$;
REVOKE ALL ON FUNCTION public.collab_list_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text) TO anon, authenticated;

-- ── Upsert a row: companions are stored again ────────────────────────────────
-- Positions are preserved (so "מלווה 2" stays the second seat); each name is
-- trimmed to 80 chars and the array capped at 49 entries (max extra seats for
-- guests_count ≤ 50).
CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid; row_id uuid; comp jsonb;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value
      AND char_length(token_value) >= 8
      AND public.collab_is_active(e)
    LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  row_id := (row_data->>'id')::uuid;
  IF row_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;

  -- Cap total rows per event so a leaked link can't flood the table.
  IF NOT EXISTS (SELECT 1 FROM public.collab_guests WHERE id = row_id AND event_id = ev_id)
     AND (SELECT count(*) FROM public.collab_guests WHERE event_id = ev_id) >= 5000 THEN
    RAISE EXCEPTION 'row limit reached';
  END IF;

  -- Normalize companions to a bounded jsonb array of ≤80-char strings, in order.
  comp := (
    SELECT COALESCE(jsonb_agg(left(COALESCE(elem, ''), 80) ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(row_data->'companions') = 'array'
           THEN row_data->'companions' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS a(elem, ord)
    WHERE ord <= 49
  );

  INSERT INTO public.collab_guests (id, event_id, name, phone, side, guest_group, guests_count, companions, updated_by, updated_at)
  VALUES (
    row_id, ev_id,
    nullif(left(trim(coalesce(row_data->>'name','')), 120), ''),
    nullif(left(trim(coalesce(row_data->>'phone','')), 20), ''),
    nullif(left(row_data->>'side', 20), ''),
    nullif(left(row_data->>'guest_group', 60), ''),
    greatest(1, least(50, coalesce((row_data->>'guests_count')::int, 1))),
    comp,
    nullif(left(trim(coalesce(row_data->>'updated_by','')), 80), ''),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name         = excluded.name,
    phone        = excluded.phone,
    side         = excluded.side,
    guest_group  = excluded.guest_group,
    guests_count = excluded.guests_count,
    companions   = excluded.companions,
    updated_by   = excluded.updated_by,
    updated_at   = now()
  WHERE public.collab_guests.event_id = ev_id;  -- never move a row across events
END;
$$;
REVOKE ALL ON FUNCTION public.collab_upsert_by_token(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_upsert_by_token(text, jsonb) TO anon, authenticated;
