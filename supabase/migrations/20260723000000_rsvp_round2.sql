-- ─────────────────────────────────────────────────────────────────────────────
-- RSVP round 2 — run once in Supabase SQL Editor.
--   1. Expose invite_token via public_event_by_token so the RSVP/gift pages can
--      link back to the event site.
--   2. Add a `status` column to rsvp_responses to support a third "maybe" (אולי)
--      answer alongside the existing yes/no boolean.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Function: add invite_token to the returned object.
CREATE OR REPLACE FUNCTION public.public_event_by_token(token_type text, token_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
    'site', CASE WHEN COALESCE((e.payload->'eventSite'->>'enabled')::boolean, false)
                 THEN e.payload->'eventSite' ELSE NULL END,
    'rsvp_token', e.rsvp_token, 'gift_token', e.gift_token, 'invite_token', e.invite_token)
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

-- 2. rsvp_responses.status — 'yes' | 'no' | 'maybe' (nullable; old rows derive
--    from the attending boolean).
ALTER TABLE public.rsvp_responses
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IS NULL OR status IN ('yes', 'no', 'maybe'));
