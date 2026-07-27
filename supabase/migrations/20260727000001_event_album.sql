-- ── Shared event album ─────────────────────────────────────────────────────
-- Guests and the photographer upload to one place, and the couple gets every
-- picture from the night instead of chasing them across WhatsApp groups.
--
-- Storage rather than the event payload: photos are the one thing that cannot
-- live in the JSON blob the rest of the event syncs as. A single phone photo
-- base64'd is ~2MB of payload; a few hundred would make every save unusable.
--
-- Access model — deliberately narrow:
--   * uploads are anonymous but must carry a valid album token in the path,
--     so only people the host actually shared the link with can add photos;
--   * reads are public within a bucket that stores nothing else;
--   * deletes are owner-only, via the authenticated role.
--
-- Idempotent — safe to run more than once.

-- 1. The bucket. Public read; 10MB per object, which is a generous phone photo
--    after the client-side downscale and a hard stop on someone uploading video.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-album', 'event-album', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Photo index. The file itself lives in storage; this row is what the
--    gallery reads, so listing does not depend on a storage LIST call.
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

-- 3. Anonymous insert, but only with a token that matches a real event.
--    Without the token check any visitor could write rows for any event.
drop policy if exists album_photos_public_insert on public.album_photos;
create policy album_photos_public_insert
  on public.album_photos for insert to anon, authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = album_photos.event_id
        and e.payload ->> 'albumToken' = album_photos.album_token
    )
  );

-- 4. Anyone holding the link can view the gallery.
drop policy if exists album_photos_public_select on public.album_photos;
create policy album_photos_public_select
  on public.album_photos for select to anon, authenticated
  using (true);

-- 5. Only the event's owner may remove a photo.
drop policy if exists album_photos_owner_delete on public.album_photos;
create policy album_photos_owner_delete
  on public.album_photos for delete to authenticated
  using (
    exists (select 1 from public.events e
            where e.id = album_photos.event_id and e.user_id = auth.uid())
  );

-- 6. Storage object policies, scoped to this bucket only.
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
  using (bucket_id = 'event-album');

comment on table public.album_photos is
  'Index of shared event-album photos. Files live in the event-album storage bucket; anonymous inserts require a matching albumToken on the event.';

-- 7. Teach the public token lookup about the album token, and expose the
--    invite token so the announcement pages can resolve through the same call.
--    The album token lives in the payload rather than its own column: it needs
--    no index (one lookup per page load) and adding a column would mean a
--    second migration on the events table.
CREATE OR REPLACE FUNCTION public.public_event_by_token(token_type text, token_value text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    'bit_phone', e.payload->>'giftBitPhone', 'paybox_link', e.payload->>'giftPayboxLink',
    -- Only serve the site once the host has published it, so an unpublished
    -- draft is never delivered to guests.
    'site', CASE WHEN COALESCE((e.payload->'eventSite'->>'enabled')::boolean, false)
                 THEN e.payload->'eventSite' ELSE NULL END,
    -- Save-the-Date / invitation. Each carries its own enabled flag, which the
    -- page checks; unlike the site they are cheap enough to send as-is.
    'announcements', e.payload->'announcements',
    -- Sibling public tokens so the pages can link to each other. hostess_token
    -- is deliberately NOT exposed: it unlocks the full guest list and seating
    -- map, and the invite link is shared with every guest.
    'rsvp_token', e.rsvp_token, 'gift_token', e.gift_token, 'invite_token', e.invite_token)
  FROM public.events e
  WHERE token_value IS NOT NULL AND char_length(token_value) >= 8
    AND CASE token_type
      WHEN 'rsvp'    THEN e.rsvp_token    = token_value
      WHEN 'invite'  THEN e.invite_token  = token_value
      WHEN 'gift'    THEN e.gift_token    = token_value
      WHEN 'hostess' THEN e.hostess_token = token_value
      WHEN 'album'   THEN e.payload->>'albumToken' = token_value
      ELSE false END
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.public_event_by_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_event_by_token(text, text) TO anon, authenticated;
