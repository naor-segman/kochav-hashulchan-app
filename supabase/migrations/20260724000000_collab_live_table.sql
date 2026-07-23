-- ── Live collaborative guest table ─────────────────────────────────────────
-- A shared, real-time table per event. Anyone with the collab link can read the
-- whole list and add/edit/delete rows live; the owner's app keeps this table and
-- events.payload.guests in sync BOTH ways, keyed by a shared row id.
--
-- Security posture (intentional): the collab link is "fully open" by product
-- design, so anon may READ every row of a collab-enabled event (needed for
-- Realtime) and WRITE via token-validated SECURITY DEFINER functions. The
-- event_id is an unguessable UUID handed out only through the token, so it acts
-- as the capability. Idempotent.

-- 1. The table. `id` is the SAME uuid used for the guest row in the app, so a
--    row here and its guest-list counterpart stay linked for two-way sync.
CREATE TABLE IF NOT EXISTS public.collab_guests (
  id            uuid PRIMARY KEY,
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name          text CHECK (name IS NULL OR char_length(name) <= 120),
  phone         text CHECK (phone IS NULL OR char_length(phone) <= 20),
  side          text CHECK (side IS NULL OR char_length(side) <= 20),
  guest_group   text CHECK (guest_group IS NULL OR char_length(guest_group) <= 60),
  guests_count  int  NOT NULL DEFAULT 1 CHECK (guests_count BETWEEN 1 AND 50),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text CHECK (updated_by IS NULL OR char_length(updated_by) <= 80)
);

CREATE INDEX IF NOT EXISTS idx_collab_guests_event
  ON public.collab_guests (event_id, updated_at DESC);

ALTER TABLE public.collab_guests ENABLE ROW LEVEL SECURITY;

-- 2. Owner (authenticated) has full access to their events' rows — this is what
--    the app's two-way sync engine uses to push app→table changes.
DROP POLICY IF EXISTS "cg_owner_all" ON public.collab_guests;
CREATE POLICY "cg_owner_all" ON public.collab_guests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  );

-- 3. Anon may READ rows of any collab-enabled event (required so Realtime can
--    deliver live changes to family members). Anon writes go only through the
--    token-validated functions below — never a direct table grant.
DROP POLICY IF EXISTS "cg_anon_select" ON public.collab_guests;
CREATE POLICY "cg_anon_select" ON public.collab_guests
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.collab_token IS NOT NULL)
  );

GRANT SELECT ON public.collab_guests TO anon;

-- 4. Add the table to the Realtime publication (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'collab_guests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_guests;
  END IF;
END $$;

-- Realtime sends full row data on UPDATE/DELETE only with REPLICA IDENTITY FULL.
ALTER TABLE public.collab_guests REPLICA IDENTITY FULL;

-- 5. Anon read of the whole list for an event, by token (initial load).
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
    'updated_at',   g.updated_at,
    'updated_by',   g.updated_by
  ) ORDER BY g.updated_at DESC), '[]'::jsonb)
  FROM public.collab_guests g
  JOIN public.events e ON e.id = g.event_id
  WHERE e.collab_token = token_value
    AND char_length(token_value) >= 8;
$$;
REVOKE ALL ON FUNCTION public.collab_list_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text) TO anon, authenticated;

-- 6. Anon insert/update of one row, keyed by the collab token. The caller passes
--    a client-generated uuid so the row links to the app's guest row.
CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid; row_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value AND char_length(token_value) >= 8 LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;

  row_id := (row_data->>'id')::uuid;
  IF row_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;

  -- Cap total rows per event so a leaked link can't flood the table.
  IF NOT EXISTS (SELECT 1 FROM public.collab_guests WHERE id = row_id AND event_id = ev_id)
     AND (SELECT count(*) FROM public.collab_guests WHERE event_id = ev_id) >= 5000 THEN
    RAISE EXCEPTION 'row limit reached';
  END IF;

  INSERT INTO public.collab_guests (id, event_id, name, phone, side, guest_group, guests_count, updated_by, updated_at)
  VALUES (
    row_id, ev_id,
    nullif(left(trim(coalesce(row_data->>'name','')), 120), ''),
    nullif(left(trim(coalesce(row_data->>'phone','')), 20), ''),
    nullif(left(row_data->>'side', 20), ''),
    nullif(left(row_data->>'guest_group', 60), ''),
    greatest(1, least(50, coalesce((row_data->>'guests_count')::int, 1))),
    nullif(left(trim(coalesce(row_data->>'updated_by','')), 80), ''),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name         = excluded.name,
    phone        = excluded.phone,
    side         = excluded.side,
    guest_group  = excluded.guest_group,
    guests_count = excluded.guests_count,
    updated_by   = excluded.updated_by,
    updated_at   = now()
  WHERE public.collab_guests.event_id = ev_id;  -- never move a row across events
END;
$$;
REVOKE ALL ON FUNCTION public.collab_upsert_by_token(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_upsert_by_token(text, jsonb) TO anon, authenticated;

-- 7. Anon delete of one row, keyed by the collab token.
CREATE OR REPLACE FUNCTION public.collab_delete_by_token(token_value text, row_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value AND char_length(token_value) >= 8 LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  DELETE FROM public.collab_guests WHERE id = row_id AND event_id = ev_id;
END;
$$;
REVOKE ALL ON FUNCTION public.collab_delete_by_token(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_delete_by_token(text, uuid) TO anon, authenticated;
