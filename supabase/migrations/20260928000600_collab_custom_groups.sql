-- =============================================================================
-- Migration: 20260928000600_collab_custom_groups
-- Depends on: 20260814000000_collab_parents_type
--
-- WORKPLAN 106: the shared family table offered only the built-in group list.
-- A host who had made their own groups ("חברים מהצבא", "השכנים מהבניין") saw
-- their relatives file everyone under the stock names, and a row already in a
-- custom group rendered with an empty group select. The RPC never sent them.
--
-- Adds custom_groups (the host's own group names — labels, nothing personal).
-- Everything else is 20260814000000's body unchanged; CREATE OR REPLACE keeps
-- the existing grants.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.collab_event_by_token(token_value text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',            e.id,
    'name',          e.name,
    'type',          e.type,
    'bride_name',    e.payload->>'brideName',
    'groom_name',    e.payload->>'groomName',
    'couple_type',   e.payload->>'coupleType',
    'parents_type',  e.payload->>'parentsType',
    'side_labels',   e.payload->'sideLabels',
    'custom_groups', CASE WHEN jsonb_typeof(e.payload->'customGroups') = 'array'
                          THEN e.payload->'customGroups' ELSE '[]'::jsonb END
  )
  FROM public.events e
  WHERE token_value IS NOT NULL
    AND char_length(token_value) >= 8
    AND e.collab_token = token_value
    AND public.collab_is_active(e)
  LIMIT 1;
$$;
