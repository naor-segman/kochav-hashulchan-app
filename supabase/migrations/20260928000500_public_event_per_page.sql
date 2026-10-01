-- =============================================================================
-- Migration: 20260928000500_public_event_per_page
-- Depends on: 20260928000400_album_link_on_site
--
-- Each guest page gets what it renders, and nothing else (WORKPLAN 106, ט2).
--
-- 1. The whole published site — contactPhone included — went to EVERY token
--    type. The album QR is designed to be photographed off a table by
--    strangers; it and the gift link now receive no site at all.
-- 2. The RSVP page reads its own settings (message, shuttles, schedule,
--    sections) from eventSite, and received them only once the SITE was
--    published — so a host who never published the site silently lost the
--    shuttle question and the thank-you line. The rsvp token now gets those
--    fields always, and the cover photo only once published. Never the phone.
-- 3. The RSVP success screen's gift button never rendered in production: the
--    rsvp token was not given gift_token. It is now; the screen itself also
--    respects the host's gift toggle (RSVPScreen.jsx).
-- 4. Announcements go only to the invite token, the one page that shows them.
--
-- Verified against a real Postgres by qa/publicEventRpcSql.mjs.
-- =============================================================================

create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    -- The site, per page (20260928000500):
    --   invite → the whole site, once published (unchanged)
    --   rsvp   → only the RSVP page's own settings, published or not — they
    --            are the host's RSVP settings, not site content — and never
    --            the host's contact phone
    --   others → nothing. The album QR on the tables and the gift link had
    --            been receiving the full published site, contactPhone included.
    'site', case
      when token_type = 'invite' and coalesce((e.payload->'eventSite'->>'enabled')::boolean, false)
        then e.payload->'eventSite'
      when token_type = 'rsvp' then jsonb_strip_nulls(jsonb_build_object(
        'enabled',     coalesce((e.payload->'eventSite'->>'enabled')::boolean, false),
        'coverPhoto',  case when coalesce((e.payload->'eventSite'->>'enabled')::boolean, false)
                            then e.payload->'eventSite'->'coverPhoto' end,
        'rsvpMessage', e.payload->'eventSite'->'rsvpMessage',
        'shuttles',    e.payload->'eventSite'->'shuttles',
        'schedule',    e.payload->'eventSite'->'schedule',
        'sections',    e.payload->'eventSite'->'sections'))
      else null end,
    -- Published announcements, to the page that renders them: the invite
    -- token (/invitation, /save-the-date). A draft never leaves the database.
    'announcements', case when token_type = 'invite' then (
      select jsonb_object_agg(k, v)
        from jsonb_each(coalesce(e.payload->'announcements', '{}'::jsonb)) as a(k, v)
       where coalesce((v->>'enabled')::boolean, false)
    ) end,
    -- Sibling tokens only where a page actually links onward. The invite page
    -- is the hub and needs RSVP (and, since 20260928000400, the album); the
    -- RSVP page links back to the site. The album and gift pages link to
    -- neither, so they get neither. hostess_token
    -- and collab_token are never exposed here — they unlock the full guest list
    -- with phone numbers.
    'rsvp_token',   case when token_type in ('invite', 'rsvp') then e.rsvp_token   end,
    -- rsvp added 20260928000500: the RSVP success screen has a gift button
    -- that never rendered in production because it never got this (ט2).
    'gift_token',   case when token_type in ('invite', 'gift', 'rsvp') then e.gift_token end,
    'invite_token', case when token_type in ('invite', 'rsvp') then e.invite_token end,
    -- The event site links to the shared album (20260928000400). Only the
    -- site: the album link is for the same guests who hold the site link,
    -- and no other page links onward to it.
    'album_token',  case when token_type = 'invite' then e.payload->>'albumToken' end)
  from public.events e
  where token_value is not null and char_length(token_value) >= 8
    and case token_type
      when 'rsvp'    then e.rsvp_token    = token_value
      when 'invite'  then e.invite_token  = token_value
      when 'gift'    then e.gift_token    = token_value
      when 'hostess' then e.hostess_token = token_value
      when 'album'   then e.payload->>'albumToken' = token_value
      else false end
  limit 1;
$$;

revoke all on function public.public_event_by_token(text, text) from public;
grant execute on function public.public_event_by_token(text, text) to anon, authenticated;
