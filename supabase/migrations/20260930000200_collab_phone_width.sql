-- =============================================================================
-- Migration: 20260930000200_collab_phone_width
-- Depends on: 20260724000000_collab_live_table, 20260812000000_collab_notes
--
-- The shared family table held a phone of at most 20 characters. The host's
-- guest list has no such limit, and "050-1234567, 052-7654321" — both parents
-- in one field — is 24. The host's own sync pushed it as typed, the CHECK
-- refused it (23514) on every retry, and the host was told to check their
-- connection: that family never reached the table (30.9 contract review,
-- reproduced through PostgREST; סב44). 40, as rsvp_responses.phone already is.
-- The guest-link path truncated at 20 and now truncates at 40; the host's path
-- clips to the same widths in useCollabSync.guestToCollab.
--
-- Verified by qa/collabEventSql.mjs.
-- =============================================================================

alter table public.collab_guests drop constraint if exists collab_guests_phone_check;
alter table public.collab_guests drop constraint if exists ck_collab_phone_len;
alter table public.collab_guests add constraint ck_collab_phone_len
  check (phone is null or char_length(phone) <= 40);

CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ev_id uuid; row_id uuid; comp jsonb;
  has_notes boolean; note_val text;
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

  -- Only a STRING is an opinion about the note. Absent key, or JSON null, both
  -- mean "leave the stored value alone" on an existing row.
  has_notes := (row_data ? 'notes') AND jsonb_typeof(row_data->'notes') = 'string';
  note_val  := CASE WHEN has_notes
                    THEN nullif(left(trim(row_data->>'notes'), 500), '')
                    ELSE NULL END;

  INSERT INTO public.collab_guests (id, event_id, name, phone, side, guest_group, guests_count, companions, notes, updated_by, updated_at)
  VALUES (
    row_id, ev_id,
    nullif(left(trim(coalesce(row_data->>'name','')), 120), ''),
    nullif(left(trim(coalesce(row_data->>'phone','')), 40), ''),   -- 40 since 20260930000200
    nullif(left(row_data->>'side', 20), ''),
    nullif(left(row_data->>'guest_group', 60), ''),
    greatest(1, least(50, coalesce((row_data->>'guests_count')::int, 1))),
    comp,
    note_val,
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
    notes        = CASE WHEN has_notes THEN excluded.notes
                        ELSE public.collab_guests.notes END,
    updated_by   = excluded.updated_by,
    updated_at   = now()
  WHERE public.collab_guests.event_id = ev_id;  -- never move a row across events
END;
$$;
REVOKE ALL ON FUNCTION public.collab_upsert_by_token(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_upsert_by_token(text, jsonb) TO anon, authenticated;
