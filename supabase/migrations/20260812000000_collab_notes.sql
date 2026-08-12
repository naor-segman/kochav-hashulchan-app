-- ─────────────────────────────────────────────────────────────────────────────
-- הערות on the shared collaborative table.
--
-- THE GAP (owner, 12.8): the host's own guest form has a "הערות" field — the
-- dietary need, the wheelchair, "יושבים עם הסבים". A relative filling in the
-- shared table had nowhere to put any of it, so the host had to go and ask for
-- it in a separate WhatsApp message. Chasing the details by hand is the exact
-- thing the shared table exists to avoid.
--
-- ⚠ THIS FILE IS A FULL REDEFINITION OF BOTH TOKEN RPCs.
-- Postgres does not merge function bodies: CREATE OR REPLACE simply wins. That
-- is how companion support was silently reverted once already
-- (20260730000001 replaced these two functions with a pre-companions copy —
-- see 20260811010000_collab_companions_restore.sql for the full post-mortem).
-- So the definitions below are the CURRENT ones from
-- 20260811010000_collab_companions_restore.sql, carried over field for field —
-- the active-switch guard (`collab_is_active`), the ≥8-char token check, the
-- 5000-row cap, the cross-event WHERE on the update, and the whole companions
-- normalisation — with `notes` added and nothing else changed. If you are
-- reading this while writing the NEXT migration that touches these functions:
-- copy from here, not from an older file.
--
-- MERGE RULE — an absent key is not an instruction.
--   * `notes` present as a STRING  → that is the writer's answer and it wins,
--     including "" (someone emptied the box; the note is cleared).
--   * `notes` absent, or JSON null → NO OPINION. The stored note is kept.
-- The second half is the part that matters. Every client that has not shipped
-- this feature yet still writes rows through this function, and it sends no
-- `notes` key at all. Reading that silence as "clear the note" would let an old
-- tab, or a cached PWA, quietly delete a note somebody else typed — which is
-- precisely the failure that destroyed eight companion names in August. The
-- companions column still cannot express "leave it alone" (both write paths
-- coerce a missing array to '[]'); notes is born able to, and the client side
-- omits the key rather than sending null (src/utils/publicTokens.js).
--
-- Bounded server-side like every other free-form column here: trimmed, capped
-- at 500 chars, '' stored as NULL.
--
-- Reviewed, NOT executed — there is no live Supabase in the environment this
-- was written in. Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The column ────────────────────────────────────────────────────────────
ALTER TABLE public.collab_guests
  ADD COLUMN IF NOT EXISTS notes text;

-- The CHECK is added through the catalog rather than with a bare ADD
-- CONSTRAINT, because `ADD CONSTRAINT IF NOT EXISTS` is not PostgreSQL syntax —
-- writing it that way is what silently aborted all eight checks in
-- 20260719000000 (see 20260811030000_fix_length_constraints.sql). NOT VALID:
-- existing rows are not re-checked; new writes are.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_collab_notes_len'
       AND conrelid = 'public.collab_guests'::regclass
  ) THEN
    ALTER TABLE public.collab_guests
      ADD CONSTRAINT ck_collab_notes_len
      CHECK (notes IS NULL OR char_length(notes) <= 500) NOT VALID;
  END IF;
END $$;

-- ── 2. List the rows: notes come back ────────────────────────────────────────
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
    -- Deliberately '' and not NULL: the client distinguishes "no key" (a
    -- database that has not run this migration → keep whatever the app holds)
    -- from an explicit empty string (cleared). A JSON null would land in the
    -- first bucket and a cleared note would come back from the dead on the
    -- next poll.
    'notes',        COALESCE(g.notes, ''),
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

-- ── 3. Upsert a row: notes are stored, absence is respected ──────────────────
-- Companions unchanged from 20260811010000: positions preserved (so "מלווה 2"
-- stays the second seat); each name trimmed to 80 chars and the array capped at
-- 49 entries (max extra seats for guests_count ≤ 50).
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
    nullif(left(trim(coalesce(row_data->>'phone','')), 20), ''),
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
