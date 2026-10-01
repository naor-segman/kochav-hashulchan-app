-- =============================================================================
-- Migration: 20260930000000_guest_write_hardening
-- Depends on: 20260818000100_album_objects_cap, 20260814020000 (album_add_photo),
--             20260814010000 (submit_rsvp_by_token), 20260929000000 (gifts),
--             20260816010000 (event-site storage policies)
--
-- The third review round (30.9) attacked every anonymous write path against all
-- 52 migrations loaded into Postgres. Five defects, each reproduced there:
--
-- 1. THE ALBUM UPLOAD NEVER NEEDED THE ALBUM LINK. The storage policy checked
--    only that the folder is a real event id and that there is room. Every
--    public link hands out the event id (public_event_by_token returns it, and
--    it is in every event-site photo address), so the gift or RSVP link was
--    enough to fill the album's 5,000 slots — and changing the album link did
--    not stop it. Files uploaded that way never get an album_photos row, so the
--    host can neither see nor delete them: the album stays locked.
--    Now: an album file lives at <event id>/<album token>/<file>, and the
--    policy requires that second folder to be the event's CURRENT album token.
--    Changing the link revokes uploads. (Older files keep their paths; reading
--    and the host's delete are by the first folder, as before.)
--
-- 2. album_add_photo accepted '..' in the path, so an album-link holder could
--    index <event>/../../event-site/<other event>/cover.jpg and make the album
--    show another event's public file. It now also requires the token folder.
--
-- 3. THE LIMITS WERE LOCKOUT TOOLS. Gifts: 60 per event per minute, counted for
--    everyone — one script at a request a second shut the gift page for the
--    whole wedding. RSVP: no rate at all, only the 5,000 total, which a loop
--    reached in seconds and then refused every real guest ("limit reached").
--    Now both are limited PER SENDER (RSVP 30 a minute, gifts 60), keyed on a
--    hash of the client address and the event, kept for one minute and then
--    deleted — AND by a per-event ceiling of 300 a minute that applies to every
--    sender. The ceiling is what bounds a forged address: the address comes
--    from request headers, and whether the first x-forwarded-for hop can be
--    set by the client depends on the gateway (the fourth review measured 40
--    of 40 accepted by rotating it). IPv6 is keyed on its /64, which one
--    subscriber holds whole.
--    Why not 5: at the venue, a hall's wifi — and Israeli mobile carriers —
--    put many guests behind ONE address. "Scan to leave a blessing" from the
--    DJ is fifty guests in a minute from one address, hence 60 for gifts.
--    Fourth review, also: the room check for album files counts the CURRENT
--    album link's folder only, so files dropped there without being indexed
--    (the host cannot see them) are cleared out of the way by changing the
--    link; and album_add_photo's 5,000 is per link for the same reason.
--
-- 4. The event-site bucket had no ceiling: one signed-up account uploaded
--    20,000 files into its own event folder. The editor holds a cover, ten
--    gallery photos and the invitation's photo; 300 objects per event is far
--    past any real use, and it bounds the bill.
--
-- Verified by qa/guestWriteHardeningSql.mjs (Supabase stand-in + every
-- migration, attacks from 30.9 replayed).
-- =============================================================================

-- ── 3. The per-sender throttle ───────────────────────────────────────────────
create table if not exists public.guest_write_throttle (
  kind     text        not null,
  event_id uuid        not null,
  sender   text,                               -- md5(kind:event:address), or null
  at       timestamptz not null default now()
);
create index if not exists idx_guest_write_throttle
  on public.guest_write_throttle (event_id, kind, at);
create index if not exists idx_guest_write_throttle_at
  on public.guest_write_throttle (at);
-- Touched only by the definer functions below. No policy = no direct access.
alter table public.guest_write_throttle enable row level security;
revoke all on table public.guest_write_throttle from public, anon, authenticated;

create or replace function public.guest_throttle(
  k          text,
  ev         uuid,
  per_sender int,
  per_event  int
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  h  json;
  ip text;
  s  text;
  n  int;
begin
  -- One writer at a time per event and kind, whoever calls: the counts below
  -- are only true under a lock (measured: 44 of 80 simultaneous calls against
  -- a limit of 30 without one).
  perform pg_advisory_xact_lock(hashtextextended('throttle:' || k || ':' || ev::text, 0));

  -- PostgREST puts the request headers here. Absent, empty or not JSON: no
  -- address, and only the per-event ceiling applies.
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  ip := nullif(btrim(coalesce(
          h ->> 'cf-connecting-ip',
          nullif(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1), ''),
          h ->> 'x-real-ip',
          '')), '');
  -- One subscriber holds a whole IPv6 /64; keyed per address it is unlimited.
  if ip like '%:%' then
    begin
      ip := network(set_masklen(ip::inet, 64))::text;
    exception when others then
      null;   -- not an address after all: keyed as given
    end;
  end if;
  s := case when ip is null then null else md5(k || ':' || ev::text || ':' || ip) end;

  -- A minute of memory, no more, for EVERY event — not only the one being
  -- written, or a quiet event's rows (hashes of client addresses) stay forever.
  delete from public.guest_write_throttle where at < now() - interval '1 minute';

  -- The ceiling for the event, whoever is sending: a forged address buys at
  -- most this much, and never the 5,000 total in a few seconds.
  select count(*) into n from public.guest_write_throttle
   where event_id = ev and kind = k;
  if n >= per_event then raise exception 'rate limited'; end if;

  if s is not null then
    select count(*) into n from public.guest_write_throttle
     where event_id = ev and kind = k and sender = s;
    if n >= per_sender then raise exception 'rate limited'; end if;
  end if;

  insert into public.guest_write_throttle (kind, event_id, sender) values (k, ev, s);
end; $$;

-- Called only from inside the definer functions below, which run as their
-- owner — so no caller needs it.
revoke all on function public.guest_throttle(text, uuid, int, int) from public, anon, authenticated;

-- ── 3a. Gifts: per sender, not per event ─────────────────────────────────────
-- The body of 20260929000000 with one change: the per-event "60 in a minute"
-- count is replaced by guest_throttle. Everything else — the ₪50 floor, the
-- advisory lock, the client_key double-tap guard, the 5,000 ceiling — is as it
-- was.
create or replace function public.submit_gift_by_token(
  token_value text,
  donor_name  text,
  amount      bigint,
  message     text,
  client_key  text
) returns void language plpgsql volatile security definer set search_path = public as $$
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

-- ── 3b. RSVP: a rate, per sender ─────────────────────────────────────────────
-- The body of 20260814010000 with two additions: a per-event advisory lock (so
-- the counts below are true under simultaneous requests) and guest_throttle.
create or replace function public.submit_rsvp_by_token(
  token_value   text,
  guest_name    text,
  phone         text,
  status        text,
  guests_count  int,
  companions    text[],
  shuttle_id    text,
  meal          text
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  n     int;
  comp  jsonb;
begin
  if token_value is null or char_length(token_value) < 8 then
    raise exception 'invalid token';
  end if;

  select e.id into ev_id
    from public.events e
   where e.rsvp_token = token_value
   limit 1;

  if ev_id is null then raise exception 'invalid token'; end if;

  if coalesce(trim(guest_name), '') = '' then
    raise exception 'name required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || ev_id::text, 0));

  select count(*) into n from public.rsvp_responses where event_id = ev_id;
  if n >= 5000 then raise exception 'limit reached'; end if;

  perform public.guest_throttle('rsvp', ev_id, 30, 300);

  comp := (
    select coalesce(jsonb_agg(left(coalesce(elem, ''), 80) order by ord), '[]'::jsonb)
    from unnest(coalesce(companions, '{}'::text[])) with ordinality as a(elem, ord)
    where ord <= 49
  );

  insert into public.rsvp_responses
    (event_id, guest_name, phone, attending, guests_count, status, companions, shuttle_id, meal)
  values (
    ev_id,
    left(trim(guest_name), 200),
    nullif(left(trim(coalesce(phone, '')), 40), ''),
    status = 'yes',
    greatest(0, least(50, coalesce(guests_count, 1))),
    case when status in ('yes', 'no', 'maybe') then status else 'yes' end,
    comp,
    nullif(left(trim(coalesce(shuttle_id, '')), 64), ''),
    case when status = 'no' then null
         else nullif(left(trim(coalesce(meal, '')), 40), '') end
  );
end; $$;

revoke all on function public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) from public;
grant execute on function public.submit_rsvp_by_token(text, text, text, text, int, text[], text, text) to anon, authenticated;

-- ── 1. Album uploads need the album link ─────────────────────────────────────
create or replace function public.album_folder_token_ok(folder text, token_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select token_folder is not null
     and char_length(token_folder) >= 8
     and exists (
       select 1 from public.events e
        where e.id::text = folder
          and e.payload ->> 'albumToken' = token_folder
     );
$$;
revoke all on function public.album_folder_token_ok(text, text) from public;
grant execute on function public.album_folder_token_ok(text, text) to anon, authenticated;

-- Room is counted in the CURRENT link's folder (fourth review 30.9). Counted
-- per event, files dropped there without ever being indexed — the host's album
-- screen lists only indexed photos, so it cannot show or delete them — kept the
-- album full even after the host changed the link.
create or replace function public.album_token_folder_has_room(folder text, token_folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select (
    select count(*) from storage.objects o
     where o.bucket_id = 'event-album'
       and starts_with(o.name, folder || '/' || token_folder || '/')
  ) < 5000;
$$;
revoke all on function public.album_token_folder_has_room(text, text) from public;
grant execute on function public.album_token_folder_has_room(text, text) to anon, authenticated;

drop policy if exists album_objects_insert on storage.objects;
create policy album_objects_insert
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'event-album'
    and public.album_folder_token_ok((storage.foldername(name))[1], (storage.foldername(name))[2])
    and public.album_token_folder_has_room((storage.foldername(name))[1], (storage.foldername(name))[2])
  );

-- ── 2. album_add_photo: the token folder, and no path tricks ─────────────────
create or replace function public.album_add_photo(
  token_value text, path_value text, uploader_value text
) returns uuid language plpgsql volatile security definer set search_path = public as $$
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
  if n >= 5000 then raise exception 'limit reached' using errcode = '42501'; end if;

  insert into public.album_photos (event_id, album_token, storage_path, uploader)
  values (ev_id, token_value, path_value,
          nullif(left(btrim(coalesce(uploader_value, '')), 80), ''))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.album_add_photo(text, text, text) from public;
grant execute on function public.album_add_photo(text, text, text) to anon, authenticated;

-- ── 4. A ceiling on the event-site bucket ────────────────────────────────────
create or replace function public.site_folder_has_room(folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select (
    select count(*) from storage.objects o
     where o.bucket_id = 'event-site'
       and (storage.foldername(o.name))[1] = folder
  ) < 300;
$$;
revoke all on function public.site_folder_has_room(text) from public;
-- anon too: Supabase's default privileges give anon its own EXECUTE on every
-- new function, which `from public` does not reach (fifth review 30.9 — the
-- same trap 20260928000300 describes).
revoke all on function public.site_folder_has_room(text) from anon;
grant execute on function public.site_folder_has_room(text) to authenticated;

drop policy if exists event_site_objects_insert on storage.objects;
create policy event_site_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
    and public.site_folder_has_room((storage.foldername(storage.objects.name))[1])
  );

-- ── 5. Internal functions: revoked from PUBLIC too ───────────────────────────
-- 20260928000300 revoked album_event_id and prune_ai_usage from anon and
-- authenticated only, relying on an earlier `revoke … from public`. A function
-- re-created by hand keeps PostgreSQL's default EXECUTE-to-PUBLIC, and anon
-- could call it again (30.9 migration review). Said outright here.
revoke execute on function public.album_event_id(text) from public, anon, authenticated;
revoke execute on function public.prune_ai_usage()     from public, anon, authenticated;
