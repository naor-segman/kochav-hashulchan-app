-- ─────────────────────────────────────────────────────────────────────────────
-- The shared guest table gets an ON/OFF switch.
--
-- The collab token is a full-control capability: whoever holds the link can
-- read every guest's phone number, edit any row, delete any row and export the
-- lot to Excel. It is minted once and there was no way to withdraw it — a
-- single forward in a family WhatsApp group was permanent.
--
-- The host asked for a switch rather than a new link, and that is the better
-- shape: the relatives keep the link they already have, and the host decides
-- when it answers. Same URL, on or off.
--
-- Enforced HERE, not in the client. A toggle that only hides a button is
-- decoration — anyone holding the token can call these RPCs directly.
--
-- Default is ON, so nothing changes for an event that is already being filled
-- in: `payload->>'collabActive'` is absent on every existing row, and absent
-- means active. Only an explicit "false" closes it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.collab_is_active(e public.events)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(e.payload->>'collabActive', 'true') <> 'false';
$$;

-- ── Read the event behind the token ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.collab_event_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',          e.id,
    'name',        e.name,
    'type',        e.type,
    'bride_name',  e.payload->>'brideName',
    'groom_name',  e.payload->>'groomName',
    'couple_type', e.payload->>'coupleType',
    'side_labels', e.payload->'sideLabels'
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.collab_token = token_value
    AND public.collab_is_active(e)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.collab_event_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_event_by_token(text) TO anon, authenticated;

-- ── List the rows ────────────────────────────────────────────────────────────
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
    AND char_length(token_value) >= 8
    AND public.collab_is_active(e);
$$;
REVOKE ALL ON FUNCTION public.collab_list_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_list_by_token(text) TO anon, authenticated;

-- ── Write paths ──────────────────────────────────────────────────────────────
-- The two that matter most: with the switch off, a holder of the link must not
-- be able to add, change or remove a row either.
CREATE OR REPLACE FUNCTION public.collab_upsert_by_token(token_value text, row_data jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid; row_id uuid;
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

CREATE OR REPLACE FUNCTION public.collab_delete_by_token(token_value text, row_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value
      AND char_length(token_value) >= 8
      AND public.collab_is_active(e)
    LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  DELETE FROM public.collab_guests WHERE id = row_id AND event_id = ev_id;
END;
$$;
REVOKE ALL ON FUNCTION public.collab_delete_by_token(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_delete_by_token(text, uuid) TO anon, authenticated;
