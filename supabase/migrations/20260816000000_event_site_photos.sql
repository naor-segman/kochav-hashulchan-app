-- ─────────────────────────────────────────────────────────────────────────────
-- Event-site photos: move the host's gallery out of the event payload.
--
-- WHY
--
-- The gallery lives inside `eventSite`, and the up-mapper carries `eventSite`
-- whole, so once a host uploads six photos EVERY edit re-uploads all six.
-- Measured (qa/storageSize.mjs): renaming a venue costs 1.13MB, against 0.10MB
-- for the same event without photos, and an evening of seating work is dozens
-- of those writes. The same base64 also sits in localStorage, where one such
-- event is 3.03MB of a ~5MB per-origin budget shared by every event the host
-- has — so a second one breaks saving for ALL of them.
--
-- The floor-plan image is already excluded from the payload for being too
-- large. The gallery beside it is eleven times larger and was not.
--
-- WHY NOT JUST EXCLUDE IT
--
-- The public event site reads the gallery from the cloud. Dropping it from the
-- payload would empty the page guests actually see.
--
-- SHAPE
--
-- Deliberately simpler than the album bucket next to it, because the trust
-- model is different. The album is written by ANONYMOUS guests holding a
-- token, which is why it needs SECURITY DEFINER functions and an index table.
-- This bucket is written only by the signed-in host who owns the event, so
-- plain RLS on storage.objects is sufficient and there is no new table: the
-- URL is stored in the event payload exactly where the base64 used to be, and
-- every consumer already renders it with <img src>.
--
-- Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Bucket. Public read, because the event site is served to guests who are
--    not signed in and hold only a token. 5MB per object: the client downscales
--    to ~150KB, so this is a wide safety margin and a hard stop on video.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-site', 'event-site', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Write access: the host, into a folder named after an event they own.
--
--    `bucket_id = 'event-site'` alone would let any signed-up user write into
--    any event's folder — including overwriting another customer's cover photo.
--    The folder check is what makes the prefix mean something. Same reasoning,
--    and the same shape, as the album policies hardened in
--    20260728000000_public_write_hardening.sql.
drop policy if exists event_site_objects_insert on storage.objects;
create policy event_site_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

-- Replacing a photo at the same path, and removing one the host deleted from
-- the gallery. Without DELETE the bucket only ever grows: a host who swaps
-- their cover photo ten times leaves ten orphans nobody can reach or clean.
drop policy if exists event_site_objects_update on storage.objects;
create policy event_site_objects_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

drop policy if exists event_site_objects_delete on storage.objects;
create policy event_site_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );

-- 3. Listing, for the host only, scoped the same way.
--
--    Guests never need this: they load each image by its public URL, which a
--    public bucket serves without consulting any policy. A bucket-wide SELECT
--    would let one signed-up customer enumerate every other customer's photos
--    and harvest event ids in bulk — the exact hole that had to be closed on
--    the album bucket after the fact.
drop policy if exists event_site_objects_select on storage.objects;
create policy event_site_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(name))[1] = e.id::text
    )
  );
