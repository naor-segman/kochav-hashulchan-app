-- ─────────────────────────────────────────────────────────────────────────────
-- Event Site — expose the auto-built guest site (payload.eventSite) to the
-- public token fetch. Run once in Supabase SQL Editor.
-- Adds the 'site' key to public_event_by_token so the /invite/:token event site
-- can render schedule, location, FAQ, theme, cover photo, etc.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_event_by_token(token_type text, token_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
    -- Only serve the site once the host has published it (enabled=true), so an
    -- unpublished/unpublished-again draft is never delivered to guests.
    'site', CASE WHEN COALESCE((e.payload->'eventSite'->>'enabled')::boolean, false)
                 THEN e.payload->'eventSite' ELSE NULL END,
    -- sibling public tokens so the event site can link to RSVP / gift pages.
    -- hostess_token is deliberately NOT exposed: it unlocks the full guest list
    -- and seating map, and the invite link is shared with every guest.
    'rsvp_token', e.rsvp_token, 'gift_token', e.gift_token)
  FROM public.events e
  WHERE token_value IS NOT NULL AND char_length(token_value) >= 8
    AND CASE token_type
      WHEN 'rsvp'    THEN e.rsvp_token    = token_value
      WHEN 'invite'  THEN e.invite_token  = token_value
      WHEN 'gift'    THEN e.gift_token    = token_value
      WHEN 'hostess' THEN e.hostess_token = token_value
      ELSE false END
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.public_event_by_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_event_by_token(text, text) TO anon, authenticated;
