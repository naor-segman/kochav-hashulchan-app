-- 137 — the guest pages' Hebrew date follows the event's start time.
--
-- Owner, 6.10: "מה שצריך להופיע זה התאריך העברי המדויק לאותו זמן של האירוע".
-- The host now enters "שעת קבלת פנים" in the event details (payload
-- receptionTime). This is the body of public_event_by_token from
-- 20261001000000_review_seven_hardening.sql, unchanged except for one new
-- key, reception_time — validated as HH:MM here so the page never receives
-- anything else. Until this runs the pages fall back to the first time in
-- the event site's schedule, and with neither they print the daytime date.

create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    -- 137 (owner, 6.10): the host's "שעת קבלת פנים", so the guest pages print
    -- the Hebrew date of the moment the event starts (after sunset it is the
    -- next day's). A wall-clock time, nothing personal; every page gets it.
    'reception_time', case when e.payload->>'receptionTime' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                           then e.payload->>'receptionTime' end,
    -- The site, per page (20260928000500):
    --   invite → the whole site, once published (unchanged)
    --   rsvp   → only the RSVP page's own settings, published or not — they
    --            are the host's RSVP settings, not site content — and never
    --            the host's contact phone
    --   others → nothing. The album QR on the tables and the gift link had
    --            been receiving the full published site, contactPhone included.
    'site', case
      when token_type = 'invite' and coalesce(public.safe_bool(e.payload->'eventSite'->>'enabled'), false)
        then e.payload->'eventSite'
      when token_type = 'rsvp' then jsonb_strip_nulls(jsonb_build_object(
        'enabled',     coalesce(public.safe_bool(e.payload->'eventSite'->>'enabled'), false),
        'coverPhoto',  case when coalesce(public.safe_bool(e.payload->'eventSite'->>'enabled'), false)
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
       where coalesce(public.safe_bool(v->>'enabled'), false)
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
    -- The event site links to the shared album (20260928000400) — from the
    -- day of the event, once the site is published. That rule was enforced
    -- only by the page (ב6, 1.10): the token itself went to every invite-type
    -- link from the day the event was created, so the invitation and the
    -- save-the-date card carried an album anyone could read and upload to.
    'album_token',  case when token_type = 'invite'
                          and coalesce(public.safe_bool(e.payload->'eventSite'->>'enabled'), false)
                          and public.safe_iso_date(e.date) <= (now() at time zone 'Asia/Jerusalem')::date
                     then e.payload->>'albumToken' end)
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
