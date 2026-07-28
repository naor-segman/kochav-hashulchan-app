-- Public-surface hardening.
--
-- Everything a guest can reach without an account is re-checked here. Four
-- things were open, all of them chaining into each other: an anonymous caller
-- could list the whole album bucket, harvest every event id from it, and then
-- write arbitrary rows into any host's RSVP list and gift wall — none of the
-- public write paths validated a token, and the length limits that were meant
-- to bound them were never actually applied.
--
-- Run in the Supabase SQL editor. Idempotent — safe to run more than once.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The bounds from 20260719 never existed.
--
-- That migration used `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS`, which is
-- not valid PostgreSQL — there is no IF NOT EXISTS for ADD CONSTRAINT (only for
-- ADD COLUMN). The statement raises a syntax error, so the whole script aborted
-- and not one of those eight bounds is on the table. Re-issued correctly, each
-- guarded so a re-run is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  alter table public.rsvp_responses
    add constraint ck_rsvp_guest_name_len check (char_length(guest_name) <= 200);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.rsvp_responses
    add constraint ck_rsvp_phone_len check (phone is null or char_length(phone) <= 40);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.rsvp_responses
    add constraint ck_rsvp_guests_count_range check (guests_count between 0 and 50);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.gifts
    add constraint ck_gift_donor_name_len check (char_length(donor_name) <= 200);
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.gifts
    add constraint ck_gift_message_len check (message is null or char_length(message) <= 1000);
exception when duplicate_object then null; end $$;

-- Amounts are agorot. Floor of ₪5, ceiling of ₪100,000 — a gift outside that
-- range is a typo or an attack, not a guest.
do $$
begin
  alter table public.gifts
    add constraint ck_gift_amount_range check (amount between 500 and 10000000);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RSVP and gift writes move behind token-validated functions.
--
-- Both tables carried `FOR INSERT WITH CHECK (true)` and the client wrote them
-- directly, so the token check lived only in JavaScript — i.e. nowhere. Anyone
-- holding an event id could post unlimited rows into a stranger's RSVP list and
-- onto the blessing wall shown on the screen at their venue.
--
-- These mirror submit_guest_by_token, which already had the right shape.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.submit_rsvp_by_token(
  token_value   text,
  guest_name    text,
  phone         text,
  status        text,
  guests_count  int,
  companions    text[],
  shuttle_id    text
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  n     int;
begin
  if token_value is null or char_length(token_value) < 8 then
    raise exception 'invalid token';
  end if;

  select e.id into ev_id
    from public.events e
   where e.rsvp_token = token_value
   limit 1;

  if ev_id is null then
    raise exception 'invalid token';
  end if;

  if coalesce(trim(guest_name), '') = '' then
    raise exception 'name required';
  end if;

  -- Same ceiling submit_guest_by_token uses. A real event does not have 5000
  -- responses; anything past it is someone hammering the endpoint.
  select count(*) into n from public.rsvp_responses where event_id = ev_id;
  if n >= 5000 then
    raise exception 'limit reached';
  end if;

  insert into public.rsvp_responses
    (event_id, guest_name, phone, attending, guests_count, status, companions, shuttle_id)
  values (
    ev_id,
    left(trim(guest_name), 200),
    nullif(left(trim(coalesce(phone, '')), 40), ''),
    status = 'yes',
    greatest(0, least(50, coalesce(guests_count, 1))),
    case when status in ('yes', 'no', 'maybe') then status else 'yes' end,
    coalesce(companions, '{}')::text[],
    nullif(trim(coalesce(shuttle_id, '')), '')
  );
end; $$;

revoke all on function public.submit_rsvp_by_token(text, text, text, text, int, text[], text) from public;
grant execute on function public.submit_rsvp_by_token(text, text, text, text, int, text[], text) to anon, authenticated;

create or replace function public.submit_gift_by_token(
  token_value text,
  donor_name  text,
  amount      bigint,
  message     text
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  n     int;
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

  if coalesce(trim(donor_name), '') = '' then
    raise exception 'name required';
  end if;

  if amount is null or amount < 500 or amount > 10000000 then
    raise exception 'amount out of range';
  end if;

  select count(*) into n from public.gifts where event_id = ev_id;
  if n >= 5000 then
    raise exception 'limit reached';
  end if;

  insert into public.gifts (event_id, donor_name, amount, message, paid)
  values (ev_id, left(trim(donor_name), 200), amount,
          nullif(left(trim(coalesce(message, '')), 1000), ''), false);
end; $$;

revoke all on function public.submit_gift_by_token(text, bigint, text) from public;
grant execute on function public.submit_gift_by_token(text, bigint, text) to anon, authenticated;

-- Now close the direct paths those functions replace.
drop policy if exists "rsvp_public_insert"  on public.rsvp_responses;
drop policy if exists "gifts_public_insert" on public.gifts;
revoke insert on public.rsvp_responses from anon;
revoke insert on public.gifts          from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The gift wall policy was reading every gift in the database.
--
-- `CREATE POLICY ... FOR SELECT USING (paid = true)` with no TO clause defaults
-- to PUBLIC, so anon could select * from gifts and get donor names, messages,
-- amounts and stripe_payment_intent for every customer — while the token-gated
-- RPC deliberately returns only name/message/date. The wall reads through
-- gift_wall_by_token, so nothing depends on this policy.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "gifts_wall_select" on public.gifts;
revoke select on public.gifts from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Album storage: stop the bucket-wide LIST.
--
-- `using (bucket_id = 'event-album')` scoped to the bucket but not to a folder,
-- so an anonymous caller could list every event's folder — which is both a
-- gallery leak and a way to harvest event ids in bulk. Guests are unaffected:
-- the gallery lists through album_list_by_token and loads each image by its
-- public URL, which a public bucket serves without consulting this policy.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists album_objects_select on storage.objects;
create policy album_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-album'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

-- Uploads stay open to anon — guests photographing a wedding do not have
-- accounts — but are pinned to a folder that is a real event. A storage policy
-- cannot see `events` as anon (no SELECT grant), so the check goes through a
-- SECURITY DEFINER helper. This does not make an event id a secret; it stops
-- the bucket being used as free anonymous file hosting on our domain.
create or replace function public.album_folder_is_event(folder text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events e where e.id::text = folder);
$$;
revoke all on function public.album_folder_is_event(text) from public;
grant execute on function public.album_folder_is_event(text) to anon, authenticated;

drop policy if exists album_objects_insert on storage.objects;
create policy album_objects_insert
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'event-album'
    and public.album_folder_is_event((storage.foldername(name))[1])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. public_event_by_token: stop over-sharing.
--
-- Two changes. Unpublished announcements were served in full and hidden only by
-- client-side JS, so a guest reading the raw response saw a save-the-date the
-- host had not announced yet — the adjacent `site` key already gated on its
-- enabled flag, this now matches it. And every token type received all three
-- sibling tokens, which made the four guest-facing links one link: a leaked
-- album QR could not be revoked without killing RSVP and the invite too.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
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
    -- is the hub and needs RSVP; the RSVP page links back to the site. The
    -- album and gift pages link to neither, so they get neither. hostess_token
    -- and collab_token are never exposed here — they unlock the full guest list
    -- with phone numbers.
    'rsvp_token',   case when token_type in ('invite', 'rsvp') then e.rsvp_token   end,
    'gift_token',   case when token_type in ('invite', 'gift') then e.gift_token   end,
    'invite_token', case when token_type in ('invite', 'rsvp') then e.invite_token end)
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

comment on function public.submit_rsvp_by_token(text, text, text, text, int, text[], text) is
  'Token-validated RSVP write. Replaces the direct anon INSERT, which accepted any event_id.';
comment on function public.submit_gift_by_token(text, bigint, text) is
  'Token-validated gift write. Replaces the direct anon INSERT, which accepted any event_id.';
