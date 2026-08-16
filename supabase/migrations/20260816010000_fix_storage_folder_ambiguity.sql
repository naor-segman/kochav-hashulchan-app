-- ─────────────────────────────────────────────────────────────────────────────
-- Storage policies compared the folder against the EVENT'S NAME, not the file's.
--
-- THE BUG
--
-- Every one of these policies is shaped:
--
--     exists (select 1 from public.events e
--             where e.user_id = auth.uid()
--               and (storage.foldername(name))[1] = e.id::text)
--
-- `name` is unqualified, and inside that subquery the nearest `name` in scope
-- is `public.events.name` — the event's title. So the check computed
-- `storage.foldername('בת המצווה של בגב')`, which has no '/', so foldername
-- returns an empty array and `[1]` is NULL. NULL never equals a uuid, so the
-- predicate was ALWAYS FALSE and every write was refused with
-- "new row violates row-level security policy" — true, and useless.
--
-- Reported as: uploading a photo to the event site fails on a correctly
-- configured project, with the bucket present, all policies present, the path
-- matching the event id exactly, and the signed-in user being the event's
-- owner. All of that was true. The policy simply was not asking what it looked
-- like it was asking.
--
-- WHY IT SURVIVED A POSTGRES REPRODUCTION
--
-- The first reproduction created `public.events` with only `id` and `user_id`.
-- With no `name` column on the inner table, `name` resolved OUTWARD to
-- storage.objects.name — the intended column — and the insert was accepted.
-- The stub passed for the one reason production failed. Fidelity is not a
-- detail: it decided the answer.
--
-- THE FIX
--
-- Qualify it. `storage.objects.name` cannot bind to anything else.
--
-- SCOPE
--
-- This also repairs the ALBUM policies, which carry the identical shape from
-- 20260727000001 and 20260728000000. Their INSERT never used the subquery, so
-- guest uploads always worked — which is exactly why nobody noticed that the
-- host's own SELECT and DELETE on their album objects have never worked.
--
-- Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Event-site bucket ────────────────────────────────────────────────────────

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
  );

drop policy if exists event_site_objects_update on storage.objects;
create policy event_site_objects_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
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
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

drop policy if exists event_site_objects_select on storage.objects;
create policy event_site_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-site'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

-- ── Album bucket: the same mistake, older ────────────────────────────────────
--
-- Guests upload through album_add_photo and read through album_list_by_token,
-- neither of which touches these — so the album kept working and hid the fault.
-- What did not work is the host listing or deleting their own album objects.

drop policy if exists album_objects_select on storage.objects;
create policy album_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'event-album'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );

drop policy if exists album_objects_owner_delete on storage.objects;
create policy album_objects_owner_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-album'
    and exists (
      select 1 from public.events e
      where e.user_id = auth.uid()
        and (storage.foldername(storage.objects.name))[1] = e.id::text
    )
  );
