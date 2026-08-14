-- ============================================================================
-- collab_event_by_token — carry parentsType to the shared guest table
--
-- A bar mitzvah, a bat mitzvah and a brit split the room into the celebrant's
-- two families, and the app now lets the host say what those families are
-- (two mothers, two fathers, a single parent) instead of hard-coding
-- "משפחת האם" / "משפחת האב".
--
-- The collab screen — the one the extended family opens from a WhatsApp link
-- to add names — renders its side labels with the same getSideLabels(ev) as the
-- app. Without parents_type in this RPC's result, that screen keeps showing the
-- old hard-coded pair: the host corrects the wording in the app, and every
-- relative still sees the version the picker exists to avoid.
--
-- The value already reaches the database on its own: it lives inside the events
-- payload jsonb, which cloudSync writes wholesale. Only the read needed
-- widening, so this is a function redefinition and touches no table.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.collab_event_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',           e.id,
    'name',         e.name,
    'type',         e.type,
    'bride_name',   e.payload->>'brideName',
    'groom_name',   e.payload->>'groomName',
    'couple_type',  e.payload->>'coupleType',
    'parents_type', e.payload->>'parentsType',
    'side_labels',  e.payload->'sideLabels'
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
