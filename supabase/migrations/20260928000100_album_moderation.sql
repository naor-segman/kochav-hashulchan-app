-- =============================================================================
-- Migration: 20260928000100_album_moderation
-- Depends on: 20260727000001_event_album, 20260816010000_fix_storage_folder_ambiguity
--
-- THE HOST CAN HIDE A GUEST'S PHOTO. Checklist 57.
--
-- The shared album has been live since 27.7: anyone holding the link uploads,
-- and everyone holding it sees everything. The host had no screen for it at all
-- — no list, no hide, no delete. The database already let the owner SELECT and
-- DELETE (album_photos_owner_select / _owner_delete, and the storage policies
-- fixed in 20260816010000), and not one line of client code used either.
-- WORKPLAN row ע: "מארח שרוצה לראות את התמונות פותח את אותו קישור ציבורי כמו
-- אורח."
--
-- This adds the one thing the schema could not do — HIDE — on the same pattern
-- as the blessing wall (20260818000300_gift_wall_moderation): a `hidden` column,
-- an owner UPDATE policy, and the public list filtering it out.
--
-- ── ONE DIFFERENCE FROM THE GIFT PRECEDENT, DELIBERATE ───────────────────────
-- gifts got `grant update ... to authenticated` on the whole row. Here the grant
-- is on the `hidden` COLUMN ONLY. With a whole-row grant the owner could also
-- rewrite `storage_path` to any string — including a path inside another
-- event's folder, since the bucket is public and the row is what the public list
-- renders — or `album_token`, or `event_id` (WITH CHECK confines that to their
-- own events, but it is still a move nobody needs). Hiding needs one boolean,
-- so one boolean is what is granted.
--
-- The table-level UPDATE that Supabase's default privileges give `anon` and
-- `authenticated` on every public table is revoked first, because a column
-- grant does NOT narrow an existing table grant — it would be silently
-- redundant. Nothing updates album_photos today (there was no UPDATE policy, so
-- no update could have succeeded), so the revoke breaks nothing.
--
-- ── WHAT HIDING DOES NOT DO, STATED SO THE UI CAN SAY IT ────────────────────
-- The `event-album` bucket is PUBLIC and images load from getPublicUrl. Hiding
-- removes a photo from the album page; it does not revoke the file's address.
-- Anyone who already saved the direct URL can still open it. Only DELETE takes
-- a photo off the internet, and the host screen says exactly that.
--
-- Hidden rows still count toward the 5,000-row cap in album_add_photo. Only
-- deletion frees room, which is the right way round: a hidden photo is still a
-- photo the host chose to keep.
-- =============================================================================

alter table public.album_photos
  add column if not exists hidden boolean not null default false;

comment on column public.album_photos.hidden is
  'Set by the event owner from the host album screen. Hidden photos are left out of album_list_by_token (the public album page) but kept in the table. The bucket is public, so a hidden photo''s direct URL still resolves — only deleting removes it.';

-- The public list reads (event_id, created_at desc) where not hidden.
create index if not exists album_photos_visible_idx
  on public.album_photos (event_id, created_at desc)
  where not hidden;

-- ── Column-level UPDATE: `hidden` and nothing else ───────────────────────────
revoke update on public.album_photos from anon, authenticated;
grant  update (hidden) on public.album_photos to authenticated;

drop policy if exists album_photos_owner_update on public.album_photos;
create policy album_photos_owner_update
  on public.album_photos for update to authenticated
  using (exists (
    select 1 from public.events e
    where e.id = album_photos.event_id and e.user_id = auth.uid()
  ))
  -- WITH CHECK as well as USING, as on gifts: a guarantee that depends on a
  -- sibling policy nobody remembers disappears the day that policy is edited.
  with check (exists (
    select 1 from public.events e
    where e.id = album_photos.event_id and e.user_id = auth.uid()
  ));

-- ── The public list leaves hidden photos out ────────────────────────────────
-- Same signature and return type as 20260727000001, so `create or replace` is
-- enough and no caller changes. The body is copied from there verbatim with one
-- predicate added; the 3,000-row limit and the ordering are unchanged.
create or replace function public.album_list_by_token(token_value text)
returns table (id uuid, storage_path text, uploader text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.storage_path, p.uploader, p.created_at
  from public.album_photos p
  where p.event_id = public.album_event_id(token_value)
    and not p.hidden
  order by p.created_at desc
  limit 3000;
$$;

revoke all on function public.album_list_by_token(text) from public;
grant execute on function public.album_list_by_token(text) to anon, authenticated;
