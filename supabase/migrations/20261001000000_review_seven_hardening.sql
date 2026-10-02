-- =============================================================================
-- Migration: 20261001000000_review_seven_hardening
-- Depends on: 20260811040000 (claim_ai_call), 20260830000100 (submit_feedback),
--             20260930000000 (submit_gift_by_token), 20260928000500
--             (public_event_by_token), 20260930000100 (safe_iso_date)
--
-- Five findings from the 1.10 triage of the open review items, each measured on
-- a real PostgreSQL 16 before this was written (qa/migrationFlight/m1001.mjs
-- replays them):
--
--   102c  claim_ai_call let concurrent claims past the hourly limit.
--   S7    submit_feedback's 100-per-hour ceiling was GLOBAL: 100 anonymous rows
--         silenced every signed-in host for an hour.
--   C3    a guest who corrected the amount after a send whose answer was lost
--         re-sent with the same client key, was told "sent", and the stored
--         row kept the OLD amount and no blessing.
--   ב6    the album token went to every invite-type link unconditionally; the
--         "from the event day, once the site is published" rule was client-side.
--   102d  29 of 31 SECURITY DEFINER functions in public had a search_path
--         without pg_temp.
--   MG6   (folded in) public_event_by_token cast eventSite.enabled with
--         ::boolean, which raises on a stray value and takes the page down;
--         the door function did the same with a guest's `arrived`.
--   ו2    the greeter's marks now record arrivedBy = 'דיילת'.
--   MG7   the door function's row lock no longer blocks gift/RSVP inserts.
--   102e  the album holds 1,500 photos per link (owner, 2.10).
--   102f  purchase rows survive an account deletion (owner, 2.10).
--
-- Safe to run more than once: every statement is CREATE OR REPLACE or an
-- idempotent ALTER.
-- =============================================================================

-- ── 0. A boolean that never raises ──────────────────────────────────────────
create or replace function public.safe_bool(v text)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if v is null then return null; end if;
  return v::boolean;
exception when others then
  return null;
end; $$;
revoke all on function public.safe_bool(text) from public, anon, authenticated;

-- ── 1. 102c — claim_ai_call, serialised per user and kind ────────────────────
CREATE OR REPLACE FUNCTION public.claim_ai_call(
  call_kind  text,
  per_hour   int DEFAULT 10,
  per_day    int DEFAULT 30
)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid       uuid := auth.uid();
  used_hour int;
  used_day  int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF call_kind IS NULL OR char_length(call_kind) = 0 OR char_length(call_kind) > 64 THEN
    RAISE EXCEPTION 'call kind required';
  END IF;

  -- Bound what a caller can ask for. These arguments exist so the edge function
  -- can be tuned per endpoint, not so a client can hand itself a bigger budget.
  per_hour := greatest(1, least(COALESCE(per_hour, 10), 100));
  per_day  := greatest(1, least(COALESCE(per_day,  30), 500));

  -- One claim at a time per user and kind. The count and the insert were one
  -- statement, which the original comment took to mean "two concurrent calls
  -- cannot both see 9 used" — under READ COMMITTED they can: each count is
  -- blind to the other's uncommitted insert. Measured: 150 parallel claims
  -- against a limit of 10 → 11 accepted; 40 with transactions held open → 40.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai:' || uid::text || ':' || call_kind, 0));

  WITH ins AS (
    INSERT INTO public.ai_usage (user_id, kind)
    SELECT uid, call_kind
    WHERE (SELECT count(*) FROM public.ai_usage
            WHERE user_id = uid AND kind = call_kind
              AND created_at > now() - interval '1 hour') < per_hour
      AND (SELECT count(*) FROM public.ai_usage
            WHERE user_id = uid AND kind = call_kind
              AND created_at > now() - interval '1 day') < per_day
    RETURNING 1
  )
  SELECT count(*)::int INTO used_hour FROM ins;

  IF used_hour = 0 THEN
    RAISE EXCEPTION 'rate limit reached' USING ERRCODE = '53400';
  END IF;

  SELECT count(*) INTO used_hour FROM public.ai_usage
   WHERE user_id = uid AND kind = call_kind AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO used_day FROM public.ai_usage
   WHERE user_id = uid AND kind = call_kind AND created_at > now() - interval '1 day';

  RETURN least(per_hour - used_hour, per_day - used_day);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_call(text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_ai_call(text, int, int) TO authenticated;

-- ── 2. S7 — feedback: the global ceiling applies to anonymous senders only ───
-- A signed-in host gets a ceiling of their own (20 an hour), so a flood of
-- anonymous rows can no longer switch feedback off for everyone. The anonymous
-- ceiling stays global: without an address there is nothing to key it on.
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_kind       text,
  p_message    text,
  p_contact    text DEFAULT NULL,
  p_route      text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_kind    text := lower(trim(coalesce(p_kind, '')));
  v_route   text := left(coalesce(p_route, ''), 200);
  v_uid     uuid := auth.uid();
BEGIN
  IF v_message IS NULL THEN RETURN false; END IF;
  v_message := left(v_message, 4000);

  IF v_kind NOT IN ('bug', 'idea', 'other') THEN
    v_kind := 'other';
  END IF;

  -- Double-tap, not a second opinion.
  IF EXISTS (
    SELECT 1 FROM public.feedback
    WHERE message = v_message
      AND user_id IS NOT DISTINCT FROM v_uid
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RETURN true;
  END IF;

  IF v_uid IS NULL THEN
    IF (SELECT count(*) FROM public.feedback
         WHERE user_id IS NULL AND created_at > now() - interval '1 hour') >= 100 THEN
      RETURN false;
    END IF;
  ELSIF (SELECT count(*) FROM public.feedback
          WHERE user_id = v_uid AND created_at > now() - interval '1 hour') >= 20 THEN
    RETURN false;
  END IF;

  INSERT INTO public.feedback (user_id, kind, message, contact, route, user_agent)
  VALUES (
    v_uid,
    v_kind,
    v_message,
    nullif(left(trim(coalesce(p_contact, '')), 200), ''),
    v_route,
    left(coalesce(p_user_agent, ''), 300)
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_feedback(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_feedback(text, text, text, text, text) TO anon, authenticated;

-- ── 3. C3 — a corrected gift under the same form key replaces the first ─────
-- The body of 20260930000000 with one change: a key that is already stored is
-- a resend of the SAME form. When its content is unchanged it is a double tap
-- (no-op, as before); when the guest changed the amount, name or blessing it is
-- a correction, and it replaces the stored row — an unpaid declaration only.
-- The key is per form and random; it is not something another guest can know.
create or replace function public.submit_gift_by_token(
  token_value text,
  donor_name  text,
  amount      bigint,
  message     text,
  client_key  text
) returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  ev_id uuid;
  n     int;
  nm    text := left(btrim(coalesce(submit_gift_by_token.donor_name, ''), E' \t\r\n\f\v'), 200);
  msg   text := nullif(left(btrim(coalesce(submit_gift_by_token.message, ''), E' \t\r\n\f\v'), 600), '');
  k     text := nullif(left(btrim(coalesce(submit_gift_by_token.client_key, '')), 64), '');
begin
  if token_value is null or char_length(token_value) < 8 then
    raise exception 'invalid token';
  end if;

  select e.id into ev_id
    from public.events e
   where e.gift_token = token_value
   limit 1;

  if ev_id is null then
    raise exception 'invalid token';
  end if;

  if nm = '' then
    raise exception 'name required';
  end if;

  if amount is null or amount < 5000 or amount > 10000000 then
    raise exception 'amount out of range';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gifts:' || ev_id::text, 0));

  if k is not null then
    if exists (select 1 from public.gifts g where g.event_id = ev_id and g.client_key = k) then
      update public.gifts g
         set donor_name = nm, amount = submit_gift_by_token.amount, message = msg
       where g.event_id = ev_id and g.client_key = k and g.paid = false
         and (g.donor_name, g.amount, coalesce(g.message, ''))
             is distinct from (nm, submit_gift_by_token.amount, coalesce(msg, ''));
      return;
    end if;
  elsif exists (
    select 1 from public.gifts g
     where g.event_id = ev_id
       and g.donor_name = nm
       and g.amount = submit_gift_by_token.amount
       and coalesce(g.message, '') = coalesce(msg, '')
       and g.created_at > now() - interval '60 seconds'
  ) then
    return;
  end if;

  select count(*) into n from public.gifts where event_id = ev_id;
  if n >= 5000 then
    raise exception 'limit reached';
  end if;

  perform public.guest_throttle('gift', ev_id, 60, 300);

  insert into public.gifts (event_id, donor_name, amount, message, paid, client_key)
  values (ev_id, nm, amount, msg, false, k);
end; $$;

revoke all on function public.submit_gift_by_token(text, text, bigint, text, text) from public;
grant execute on function public.submit_gift_by_token(text, text, bigint, text, text) to anon, authenticated;

-- ── 4. ב6 + MG6 — public_event_by_token ─────────────────────────────────────
-- The body of 20260928000500 with: the album token gated server-side, and
-- every ::boolean cast replaced by safe_bool (a stray value like "maybe" in a payload took
-- the whole public page down with "invalid input syntax for type boolean").
create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
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

-- ── 6. ו2 + MG6 + MG7 — the greeter's arrival marks say who made them ───────
-- The body of 20260929000000 with three changes: every seat the greeter's link
-- marks carries arrivedBy = 'דיילת' (the host's own taps already write
-- 'מארח' on the device — 1.10, ו2), the legacy `arrived` flag is read through
-- safe_bool, and the row lock is FOR NO KEY UPDATE — FOR UPDATE also blocked
-- a gift or RSVP insert for the same event (they take a KEY SHARE lock on the
-- event row) for as long as the door call held it. Measured 1.10: blocked
-- under FOR UPDATE, 112ms under FOR NO KEY UPDATE.
create or replace function public.hostess_mark_arrival_by_token(
  token_value text,
  guest_id    text,
  seats       jsonb,
  base        jsonb
)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare
  ev_id      uuid;
  seat_count int;
  legacy_all boolean;
  want       int[];
  was        int[];
  cur        int[];
  added      int[];
  removed    int[];
  result     jsonb;
  stamp_ms   bigint;
begin
  -- FOR NO KEY UPDATE: a second greeter's request waits here and then reads the
  -- first one's result, instead of writing back over it from a stale read.
  select e.id into ev_id
  from public.events e
  where token_value is not null
    and char_length(token_value) >= 8
    and e.hostess_token = token_value
    and public.hostess_writes_active(e)
  limit 1
  for no key update;
  if ev_id is null then raise exception 'invalid token'; end if;

  if guest_id is null or char_length(guest_id) = 0 or char_length(guest_id) > 64 then
    raise exception 'guest id required';
  end if;

  select greatest(1, coalesce((g->>'count')::int, 1)),
         coalesce(jsonb_typeof(g->'arrivedSeats') <> 'array' or g->'arrivedSeats' is null, true)
           and coalesce(public.safe_bool(g->>'arrived'), false)
    into seat_count, legacy_all
  from public.events e,
       jsonb_array_elements(coalesce(e.payload->'guests', '[]'::jsonb)) g
  where e.id = ev_id and g->>'id' = guest_id
  limit 1;
  if seat_count is null then raise exception 'guest not found'; end if;

  select coalesce(array_agg(distinct v), '{}') into want from (
    select case when x ~ '^[0-9]{1,3}$' then x::int end as v
    from jsonb_array_elements_text(case when jsonb_typeof(seats) = 'array' then seats else '[]'::jsonb end) as x
  ) s where v >= 0 and v < seat_count;

  select coalesce(array_agg(distinct v), '{}') into was from (
    select case when x ~ '^[0-9]{1,3}$' then x::int end as v
    from jsonb_array_elements_text(case when jsonb_typeof(base) = 'array' then base else '[]'::jsonb end) as x
  ) s where v >= 0 and v < seat_count;

  if legacy_all then
    -- arrived: true from before per-seat check-in = every seat (arrivedSeatsOf).
    cur := array(select generate_series(0, seat_count - 1));
  else
    select coalesce(array_agg(distinct v), '{}') into cur from (
      select case when x ~ '^[0-9]{1,3}$' then x::int end as v
      from public.events e,
           jsonb_array_elements(coalesce(e.payload->'guests', '[]'::jsonb)) g,
           jsonb_array_elements_text(case when jsonb_typeof(g->'arrivedSeats') = 'array'
                                          then g->'arrivedSeats' else '[]'::jsonb end) as x
      where e.id = ev_id and g->>'id' = guest_id
    ) s where v >= 0 and v < seat_count;
  end if;

  -- The two differences first, each on its own — EXCEPT chains associate to
  -- the left, so writing them inline would compute the wrong set.
  added   := array(select unnest(want) except select unnest(was));
  removed := array(select unnest(was)  except select unnest(want));

  select coalesce(jsonb_agg(v order by v), '[]'::jsonb) into result from (
    select distinct v from unnest(cur || added) as v
    where not (v = any (removed))
  ) s;

  stamp_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  update public.events e
  set payload = jsonb_set(
        e.payload,
        '{guests}',
        coalesce((
          select jsonb_agg(
            case when t.g->>'id' = guest_id
              then t.g
                   || jsonb_build_object('arrivedSeats', result)
                   || jsonb_build_object('arrived', to_jsonb(jsonb_array_length(result) > 0))
                   || jsonb_build_object('arrivedAt', to_jsonb(stamp_ms))
                   || jsonb_build_object('arrivedBy', 'דיילת')
              else t.g
            end
            order by t.ord
          )
          from jsonb_array_elements(coalesce(e.payload->'guests', '[]'::jsonb))
               with ordinality as t(g, ord)
        ), '[]'::jsonb)
      ),
      version    = coalesce(e.version, 1) + 1,
      updated_at = now()
  where e.id = ev_id;
end;
$$;

revoke all on function public.hostess_mark_arrival_by_token(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hostess_mark_arrival_by_token(text, text, jsonb, jsonb) to anon, authenticated;

-- ── 7. 102e — the album holds 1,500 photos per link, not 5,000 ──────────────
-- Owner's decision (2.10). Anyone holding the album link (or the site link,
-- from the event day) can upload; at 10MB a file, 5,000 was 50GB per link.
-- 1,500 is still far more than a wedding produces. Both checks move: the
-- storage room check and the index row. Changing the link starts a fresh
-- 1,500, as before.
create or replace function public.album_token_folder_has_room(folder text, token_folder text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select (
    select count(*) from storage.objects o
     where o.bucket_id = 'event-album'
       and starts_with(o.name, folder || '/' || token_folder || '/')
  ) < 1500;
$$;
revoke all on function public.album_token_folder_has_room(text, text) from public;
grant execute on function public.album_token_folder_has_room(text, text) to anon, authenticated;

create or replace function public.album_add_photo(
  token_value text, path_value text, uploader_value text
) returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  ev_id  uuid;
  new_id uuid;
  n      int;
begin
  ev_id := public.album_event_id(token_value);
  if ev_id is null then
    raise exception 'invalid album token' using errcode = '42501';
  end if;
  if path_value is null or char_length(path_value) > 400
     or left(path_value, char_length(ev_id::text || '/' || token_value || '/'))
        <> ev_id::text || '/' || token_value || '/'
     or path_value like '%..%'
     or path_value like '%//%'
     or position(E'\\' in path_value) > 0 then
    raise exception 'path does not belong to this event' using errcode = '42501';
  end if;

  -- Per link, like the room check: after the host changes the link, a flood
  -- indexed under the old one does not hold the album shut.
  select count(*) into n from public.album_photos
   where event_id = ev_id and album_token = token_value;
  if n >= 1500 then raise exception 'limit reached' using errcode = '42501'; end if;

  insert into public.album_photos (event_id, album_token, storage_path, uploader)
  values (ev_id, token_value, path_value,
          nullif(left(btrim(coalesce(uploader_value, '')), 80), ''))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.album_add_photo(text, text, text) from public;
grant execute on function public.album_add_photo(text, text, text) to anon, authenticated;

-- ── 8. 102f — purchase records outlive the account (owner, 2.10) ────────────
-- subscriptions.user_id cascaded from profiles, which cascade from
-- auth.users: deleting an account deleted its purchase rows — the records the
-- tax rules require us to keep. The row now stays, with user_id NULL, as the
-- event_id link already does (20260928000000). The privacy page says so.
alter table public.subscriptions alter column user_id drop not null;
alter table public.subscriptions drop constraint if exists subscriptions_user_id_fkey;
alter table public.subscriptions
  add constraint subscriptions_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

-- ── 5. 102d — pg_temp last on every SECURITY DEFINER search_path ────────────
-- A definer function resolves unqualified names through search_path; with
-- pg_temp left implicit it is searched FIRST, so a session that can create a
-- temp table can shadow public.events inside a definer function. Nothing that
-- reaches PostgREST can run CREATE TEMP TABLE — this is hardening, not a hole.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c
          where c like 'search_path=%pg_temp%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.fn);
  end loop;
end $$;
