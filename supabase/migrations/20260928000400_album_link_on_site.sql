-- =============================================================================
-- Migration: 20260928000400_album_link_on_site
-- Depends on: 20260818000200_drop_payment_fields_from_public_event
--
-- WORKPLAN פ: the shared album was reachable only from a link the host had to
-- send separately. The event site — the page guests keep returning to — had
-- no way to reach it, because this function hands each link type only the
-- sibling tokens its page links onward to, and the album token went to none.
--
-- The site (token type 'invite') now also receives album_token. Nothing else
-- changes: rsvp/gift/hostess/album links receive exactly what they did, and
-- hostess/collab tokens are still never served. Verified against a real
-- Postgres by qa/publicEventRpcSql.mjs.
--
-- The whole function is restated because CREATE OR REPLACE replaces it whole;
-- the body is 20260818000200's with one key added.
-- =============================================================================

create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    -- Only serve the site once the host has published it.
    'site', case when coalesce((e.payload->'eventSite'->>'enabled')::boolean, false)
                 then e.payload->'eventSite' else null end,
    -- Same rule, per announcement kind: a draft never leaves the database.
    'announcements', (
      select jsonb_object_agg(k, v)
        from jsonb_each(coalesce(e.payload->'announcements', '{}'::jsonb)) as a(k, v)
       where coalesce((v->>'enabled')::boolean, false)
    ),
    -- Sibling tokens only where a page actually links onward. The invite page
    -- is the hub and needs RSVP (and, since 20260928000400, the album); the
    -- RSVP page links back to the site. The album and gift pages link to
    -- neither, so they get neither. hostess_token
    -- and collab_token are never exposed here — they unlock the full guest list
    -- with phone numbers.
    'rsvp_token',   case when token_type in ('invite', 'rsvp') then e.rsvp_token   end,
    'gift_token',   case when token_type in ('invite', 'gift') then e.gift_token   end,
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
