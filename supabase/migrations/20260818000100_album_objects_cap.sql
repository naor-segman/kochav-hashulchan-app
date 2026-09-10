-- ─────────────────────────────────────────────────────────────────────────────
-- event-album: an anonymous upload is bounded per event
--
-- THE HOLE. `album_objects_insert` (20260728000000) grants INSERT on
-- storage.objects to `anon` with one test: is the first path segment a real
-- event id?
--
--     with check (bucket_id = 'event-album'
--                 and public.album_folder_is_event((storage.foldername(name))[1]))
--
-- No token, no ceiling. And the event id is not a secret from anyone holding
-- ANY public link: `public_event_by_token` returns `'id', e.id`. So any guest
-- who was sent the RSVP, gift, invitation or album link — or anyone they
-- forwarded it to — could PUT 10MB images into that folder in a loop, straight
-- onto the storage bill.
--
-- The 5000-row cap added in 20260814020000 bounds `album_photos`, the INDEX.
-- It does not bound `storage.objects`, where the bytes actually live. The two
-- were never connected: `album_add_photo` writes the row, the client PUTs the
-- object, and only the first had a limit.
--
-- 20260727000001 recorded this as accepted residual risk. Re-ranked now that
-- there is a paying customer and a storage bill with a name on it.
--
-- THE CAP. Same number as the sibling row cap, deliberately — two different
-- limits on two halves of one operation is how they drift. 5000 objects at the
-- bucket's 10MB ceiling is the worst case; a real 300-guest wedding uploading
-- ten photos each is 3000, so this does not touch normal use.
--
-- WHAT THIS IS NOT. It is not per-uploader and it is not authentication: one
-- determined guest can still fill an event's 5000 slots. It converts unbounded
-- into bounded, which is the difference between "a storage bill" and "one
-- event's album is spoiled". Real per-guest limiting needs the album token to
-- reach storage RLS, which it cannot today.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.album_folder_has_room(folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- `< 5000`, so the 5000th object is accepted and the 5001st is not.
  select (
    select count(*) from storage.objects o
    where o.bucket_id = 'event-album'
      and (storage.foldername(o.name))[1] = folder
  ) < 5000;
$$;

revoke all on function public.album_folder_has_room(text) from public;
grant execute on function public.album_folder_has_room(text) to anon, authenticated;

drop policy if exists album_objects_insert on storage.objects;
create policy album_objects_insert
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'event-album'
    and public.album_folder_is_event((storage.foldername(name))[1])
    and public.album_folder_has_room((storage.foldername(name))[1])
  );

comment on function public.album_folder_has_room(text) is
  'Is this event album under its 5000-object ceiling? Guards the anonymous '
  'INSERT policy on storage.objects; see 20260818000100.';
