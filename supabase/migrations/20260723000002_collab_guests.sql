-- ── Collaborative guest list (shareable) ───────────────────────────────────
-- A host shares a link; family members add guests through a clean web form
-- with dropdowns (no typos), each submission saved to the cloud. The host then
-- reviews and imports them into the event's guest list. Idempotent.

-- 1. Public token for the collaborative page.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS collab_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_collab_token
  ON public.events (collab_token) WHERE collab_token IS NOT NULL;

-- 2. Submissions table — one row per guest a family member adds.
CREATE TABLE IF NOT EXISTS public.guest_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
  phone         text CHECK (phone IS NULL OR char_length(phone) <= 20),
  side          text CHECK (side IS NULL OR char_length(side) <= 20),
  guest_group   text CHECK (guest_group IS NULL OR char_length(guest_group) <= 60),
  guests_count  int  NOT NULL DEFAULT 1 CHECK (guests_count BETWEEN 1 AND 50),
  submitted_by  text CHECK (submitted_by IS NULL OR char_length(submitted_by) <= 80),
  imported      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_submissions_event
  ON public.guest_submissions (event_id, created_at DESC);

ALTER TABLE public.guest_submissions ENABLE ROW LEVEL SECURITY;

-- Owner of the event can read + update (mark imported) its submissions.
DROP POLICY IF EXISTS "gs_owner_select" ON public.guest_submissions;
CREATE POLICY "gs_owner_select" ON public.guest_submissions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "gs_owner_update" ON public.guest_submissions;
CREATE POLICY "gs_owner_update" ON public.guest_submissions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.user_id = auth.uid())
  );

-- 3. Minimal event info for the public collab form (name + side labels source).
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
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.collab_event_by_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.collab_event_by_token(text) TO anon, authenticated;

-- 4. Anonymous insert of one guest submission, keyed by the collab token.
CREATE OR REPLACE FUNCTION public.submit_guest_by_token(token_value text, guest jsonb)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ev_id uuid;
BEGIN
  SELECT e.id INTO ev_id FROM public.events e
    WHERE e.collab_token = token_value AND char_length(token_value) >= 8 LIMIT 1;
  IF ev_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF char_length(trim(coalesce(guest->>'name',''))) = 0 THEN RAISE EXCEPTION 'name required'; END IF;
  INSERT INTO public.guest_submissions (event_id, name, phone, side, guest_group, guests_count, submitted_by)
  VALUES (
    ev_id,
    left(trim(guest->>'name'), 120),
    nullif(left(trim(coalesce(guest->>'phone','')), 20), ''),
    nullif(left(guest->>'side', 20), ''),
    nullif(left(guest->>'group', 60), ''),
    greatest(1, least(50, coalesce((guest->>'count')::int, 1))),
    nullif(left(trim(coalesce(guest->>'submittedBy','')), 80), '')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_guest_by_token(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_guest_by_token(text, jsonb) TO anon, authenticated;
