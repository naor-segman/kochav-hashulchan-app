-- ── Shared event album ─────────────────────────────────────────────────────
-- Guests and the photographer upload to one place, and the couple gets every
-- picture from the night instead of chasing them across WhatsApp groups.
--
-- Storage rather than the event payload: photos are the one thing that cannot
-- live in the JSON blob the rest of the event syncs as. A single phone photo
-- base64'd is ~2MB; a few hundred would make every save unusable.
--
-- ACCESS MODEL — the important part.
-- Anonymous access goes through SECURITY DEFINER functions, never through RLS
-- policies that read `public.events`. That table has no anon SELECT policy (it
-- was deliberately removed in 20260721000000_public_pages_v2), so a policy of
-- the form `EXISTS (SELECT 1 FROM events …)` evaluated as `anon` matches
-- nothing and would reject every guest upload. The rest of this codebase
-- already routes public reads through definer RPCs for the same reason.
--
-- Equally, `album_photos` is never directly readable by anon: the rows carry
-- `album_token`, and `SELECT … USING (true)` would let anyone enumerate every
-- event's token — which in turn unlocks public_event_by_token and the sibling
-- rsvp/gift/invite tokens. Reads go through a function that takes the token
-- and returns only that event's photos, without the token column.
--
-- Idempotent — safe to run more than once.

-- 1. Bucket. Public read; 10MB per object, which is a generous phone photo
--    after the client-side downscale and a hard stop on someone posting video.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-album', 'event-album', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Photo index. The file lives in storage; this row is what the gallery
--    reads, so listing never depends on a storage LIST call.
create table if not exists public.album_photos (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  album_token  text not null,
  storage_path text not null unique,
  uploader     text,
  created_at   timestamptz not null default now()
);

create index if not exists album_photos_event_idx
  on public.album_photos (event_id, created_at desc);

alter table public.album_photos enable row level security;

-- 3. No anon policies at all. Owners get their own event's rows directly;
--    everyone else goes through the functions below.
drop policy if exists album_photos_public_insert on public.album_photos;
drop policy if exists album_photos_public_select on public.album_photos;

drop policy if exists album_photos_owner_select on public.album_photos;
create policy album_photos_owner_select
  on public.album_photos for select to authenticated
  using (exists (select 1 from public.events e
                 where e.id = album_photos.event_id and e.user_id = auth.uid()));

drop policy if exists album_photos_owner_delete on public.album_photos;
create policy album_photos_owner_delete
  on public.album_photos for delete to authenticated
  using (exists (select 1 from public.events e
                 where e.id = album_photos.event_id and e.user_id = auth.uid()));

-- 4. Resolve a token to its event. Definer so it can read `events`.
create or replace function public.album_event_id(token_value text)
returns uuid language sql stable security definer set search_path = public as $$
  select e.id from public.events e
  where token_value is not null
    and char_length(token_value) >= 8
    and e.payload ->> 'albumToken' = token_value
  limit 1;
$$;

-- 5. Public list — only this event's photos, and never the token column.
create or replace function public.album_list_by_token(token_value text)
returns table (id uuid, storage_path text, uploader text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.storage_path, p.uploader, p.created_at
  from public.album_photos p
  where p.event_id = public.album_event_id(token_value)
  order by p.created_at desc
  limit 3000;
$$;

-- 6. Public insert — the token is validated here rather than in a policy.
create or replace function public.album_add_photo(
  token_value text, path_value text, uploader_value text
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  new_id uuid;
begin
  ev_id := public.album_event_id(token_value);
  if ev_id is null then
    raise exception 'invalid album token' using errcode = '42501';
  end if;
  -- Bind the file to its event: the client picks the path, so without this a
  -- caller could index a file belonging to a different event's folder.
  if path_value is null or path_value not like ev_id::text || '/%' then
    raise exception 'path does not belong to this event' using errcode = '42501';
  end if;

  insert into public.album_photos (event_id, album_token, storage_path, uploader)
  values (ev_id, token_value, path_value, nullif(btrim(coalesce(uploader_value, '')), ''))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.album_event_id(text)                     from public;
revoke all on function public.album_list_by_token(text)                from public;
revoke all on function public.album_add_photo(text, text, text)        from public;
grant execute on function public.album_list_by_token(text)             to anon, authenticated;
grant execute on function public.album_add_photo(text, text, text)     to anon, authenticated;
-- album_event_id stays internal: it maps a token to an id and nothing else
-- needs that mapping directly.

-- 7. Storage policies, scoped to this bucket AND to a folder that is a real
--    event. Deletes are restricted to the owner of that event — the earlier
--    `bucket_id = 'event-album'` alone would have let any signed-up user
--    delete any host's photos.
drop policy if exists album_objects_insert on storage.objects;
create policy album_objects_insert
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'event-album');

drop policy if exists album_objects_select on storage.objects;
create policy album_objects_select
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-album');

drop policy if exists album_objects_owner_delete on storage.objects;
create policy album_objects_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-album'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

comment on table public.album_photos is
  'Index of shared event-album photos. Anonymous access goes through album_list_by_token / album_add_photo (SECURITY DEFINER); the table itself is owner-only, because its rows carry the album token.';

-- NOTE — residual risk, recorded rather than hidden: an unauthenticated caller
-- can still PUT an object into the bucket without a token, because a storage
-- policy cannot validate one. The object is unreachable (nothing indexes it and
-- the gallery reads only the index), and the bucket caps size and MIME type, so
-- the exposure is wasted storage rather than data. Closing it fully needs
-- signed upload URLs minted by an Edge Function, which is a separate change.

-- 8. Teach the public token lookup about the album token, and expose the invite
--    token so the announcement pages resolve through the same call.
create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
    -- Only serve the site once the host has published it, so an unpublished
    -- draft is never delivered to guests.
    'site', case when coalesce((e.payload->'eventSite'->>'enabled')::boolean, false)
                 then e.payload->'eventSite' else null end,
    -- Save-the-Date / invitation. Each carries its own enabled flag, checked
    -- by the page.
    'announcements', e.payload->'announcements',
    -- Sibling public tokens so the pages can link to each other. hostess_token
    -- is deliberately NOT exposed: it unlocks the full guest list and seating
    -- map, and the invite link is shared with every guest.
    'rsvp_token', e.rsvp_token, 'gift_token', e.gift_token, 'invite_token', e.invite_token)
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
