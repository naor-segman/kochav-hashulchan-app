-- ─────────────────────────────────────────────────────────────────────────────
-- Photo retention: an event's photos expire 30 days after the event.
--
-- WHY
--
-- Photos are the only part of an event with real weight. Measured
-- (qa/storageSize.mjs, qa/webpGain.mjs): the event row is ~0.10MB, its photos
-- are ~3.8MB, and a 300-guest event delivers ~0.94GB to guests. Nothing about
-- that is looked at again a month after the party, and on Supabase's Pro plan
-- file storage is 100GB — about four months of accumulation at 500 events a
-- month, after which it is billed forever for photographs nobody opens.
--
-- THE EVENT IS NOT DELETED. The guest list, the seating, the arrivals, the
-- costs, the constraints all stay. Only the objects that cost money go, and
-- only the fields that pointed at them are cleared.
--
-- WHY IT IS SPLIT ACROSS SQL AND AN EDGE FUNCTION
--
-- Deleting the row from storage.objects does NOT free the bytes — the object
-- stays in the backing store and stays on the bill, while becoming unreachable
-- and therefore un-deletable. Freeing it requires the Storage API, which
-- requires the service role, which means a function. So SQL decides WHAT is due
-- and applies the result; the Edge Function does the one thing SQL cannot.
--
-- The split is also what makes this safe to run twice: the function removes the
-- objects, then calls finalize. If it dies in between, the URLs are still in
-- the payload, the event is still due, and the next run removes nothing (the
-- objects are gone) and finalizes normally. Nothing is lost either way.
--
-- Idempotent — safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The retention window, in one place ───────────────────────────────────────
--
-- The client has the same two numbers in src/utils/photoRetention.js, where
-- they drive the warning banner. They are deliberately NOT shared code: the
-- client computes in the host's local calendar and this computes in Postgres,
-- and a shared constant across that boundary would be a false comfort. What
-- keeps them honest is that both sides anchor to the SAME timezone below.

create or replace function public.photo_retention_days()
  returns integer language sql immutable
  as $$ select 30 $$;

comment on function public.photo_retention_days() is
  'Days after the event date at which its photos are deleted. Mirrored by PURGE_AFTER_DAYS in src/utils/photoRetention.js.';

-- ── "Today", in the timezone the customers live in ───────────────────────────
--
-- Postgres defaults to UTC, and the app computes the countdown in the host's
-- local calendar. Left alone, those disagree for three hours every day: the
-- banner says "נמחק היום" while the server still considers the event a day
-- short, or worse, the server purges while the banner still says one day left.
-- Both sides anchor to Israel, which is where every host is.

create or replace function public.photo_retention_today()
  returns date language sql stable
  as $$ select (now() at time zone 'Asia/Jerusalem')::date $$;

-- ── What is due ──────────────────────────────────────────────────────────────
--
-- Returns one row per event that has stored photos and has passed its window,
-- with every object URL that event holds.
--
-- `batch_limit` bounds a single run so a backlog cannot time the function out
-- and then time out again forever. Whatever is left is picked up next run.

create or replace function public.photo_purge_due(batch_limit integer default 200)
returns table (event_id uuid, urls text[])
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    e.id,
    array_agg(u.url)
  from public.events e
  -- Every place an event can hold a photo, flattened. The invitation photo
  -- under `announcements` is the LARGEST object an event has (1400px, q0.82) —
  -- collecting the gallery but not this one would clear the payload, report
  -- the event purged, and strand the heaviest file with its only reference
  -- deleted.
  cross join lateral (
    select e.payload->'eventSite'->>'coverPhoto' as url
    union all
    select jsonb_array_elements_text(
      case when jsonb_typeof(e.payload->'eventSite'->'gallery') = 'array'
           then e.payload->'eventSite'->'gallery' else '[]'::jsonb end)
    union all
    select a.value->>'photo'
    from jsonb_each(
      case when jsonb_typeof(e.payload->'announcements') = 'object'
           then e.payload->'announcements' else '{}'::jsonb end) as a
  ) u
  where
    -- `events.date` is TEXT, not a date — "ISO date string kept as text to
    -- match the app schema exactly". So it is not comparable to a date without
    -- a cast, and the cast is the hazard: the app writes '' for an event whose
    -- date has not been set, and `''::date` RAISES. One such row anywhere in
    -- the table would abort this scan and disable retention for every account,
    -- forever, with nothing but a failed cron run to show for it.
    --
    -- The regex is therefore the filter AND the guard, in that order: it
    -- rejects '' and anything malformed before any cast happens, and it is what
    -- makes "an event with no date is never due" true rather than aspirational.
    -- Guessing a date would delete a real host's photographs on the strength of
    -- a field they never filled in.
    e.date ~ '^\d{4}-\d{2}-\d{2}$'
    -- `<=`, NOT `<`. The client computes the same date as
    -- `eventDate + 30` and calls it the purge day: on day 30 the banner reads
    -- "התמונות נמחקות היום". With `<` the server waits until day 31 and the
    -- host is told their photos are gone while they are still there — the
    -- countdown reaching zero and nothing happening is worse than either
    -- boundary, because it is the one that makes the message a lie. Caught by
    -- qa/photoRetentionSql.mjs, which drives BOTH sides over the same dates and
    -- compares them rather than asserting each separately.
    and e.date::date <= (public.photo_retention_today() - public.photo_retention_days())
    -- A postponement the host asked for outranks the schedule while it lasts.
    -- The regex guard is not decoration: `('garbage')::date` RAISES, and an
    -- exception inside this scan would stop the whole batch — one malformed
    -- value written by any client would disable retention for every account.
    and coalesce(
          case when e.payload->'eventSite'->>'photosKeepUntil' ~ '^\d{4}-\d{2}-\d{2}$'
               then (e.payload->'eventSite'->>'photosKeepUntil')::date end,
          '-infinity'::date
        ) <= public.photo_retention_today()
    -- Only real objects. A legacy base64 photo has nothing behind it to remove,
    -- and an event holding only those must not be reported as having work — it
    -- would be finalized, cleared, and the host would lose photos that were
    -- costing nothing.
    and u.url is not null
    and u.url <> ''
    and u.url not like 'data:%'
  group by e.id
  limit batch_limit
$$;

comment on function public.photo_purge_due(integer) is
  'Events whose photos have passed the retention window, with their object URLs. Service role only.';

-- ── Applying the result ──────────────────────────────────────────────────────
--
-- Called AFTER the objects are gone. Clears the fields that pointed at them and
-- stamps when it happened, so the app can say "התמונות נמחקו" rather than
-- render a row of broken images.

create or replace function public.photo_purge_finalize(ev_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  site jsonb;
  ann  jsonb;
begin
  select
    case when jsonb_typeof(e.payload->'eventSite') = 'object'
         then e.payload->'eventSite' else '{}'::jsonb end,
    case when jsonb_typeof(e.payload->'announcements') = 'object'
         then e.payload->'announcements' else null end
  into site, ann
  from public.events e where e.id = ev_id;

  if not found then return; end if;

  site := site
       || jsonb_build_object('coverPhoto', null)
       || jsonb_build_object('gallery', '[]'::jsonb)
       -- Cleared too: a postponement that has already lapsed would otherwise
       -- sit in the payload forever, and a host who postponed once would see
       -- a stale "kept until" date on an event whose photos are long gone.
       || jsonb_build_object('photosKeepUntil', null)
       || jsonb_build_object('photosPurgedAt',
            to_jsonb(to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD')));

  if ann is not null then
    select jsonb_object_agg(k, v || jsonb_build_object('photo', null))
      into ann
      from jsonb_each(ann) as t(k, v);
  end if;

  update public.events e
  set payload = jsonb_set(
        case when ann is null then e.payload
             else jsonb_set(e.payload, '{announcements}', ann) end,
        '{eventSite}', site)
        -- THE PAYLOAD'S OWN updatedAt, not just the column.
        --
        -- mapCloudEventToLocalEvent reads `updatedAt` out of the PAYLOAD, and
        -- mergeCloudWithLocal gives the whole `eventSite` object to whichever
        -- side's updatedAt is newer. Bumping only the column — which is what
        -- every other definer function in this schema does, correctly, because
        -- they all touch collections that are merged row-by-row — would leave
        -- any host with an older local copy winning the merge and pushing the
        -- deleted URLs straight back into the cloud. The photos would be gone
        -- and the event would point at them forever.
        || jsonb_build_object('updatedAt', (extract(epoch from now()) * 1000)::bigint),
      -- Bump the version so an open tab's next optimistic push conflicts and
      -- re-pulls instead of silently overwriting the purge.
      version    = coalesce(e.version, 1) + 1,
      updated_at = now()
  where e.id = ev_id;
end;
$$;

comment on function public.photo_purge_finalize(uuid) is
  'Clears an event''s photo fields after its objects have been removed from Storage. Service role only.';

-- ── Reachability ─────────────────────────────────────────────────────────────
--
-- Neither of these is for customers. `photo_purge_due` reads across every
-- account's payload, and `photo_purge_finalize` deletes fields without checking
-- ownership — both are SECURITY DEFINER, so a stray GRANT to `authenticated`
-- would hand any signed-up user a cross-tenant read and a cross-tenant wipe.
-- The default EXECUTE grant to PUBLIC is revoked explicitly rather than assumed.

revoke all on function public.photo_purge_due(integer)   from public, anon, authenticated;
revoke all on function public.photo_purge_finalize(uuid) from public, anon, authenticated;
grant execute on function public.photo_purge_due(integer)   to service_role;
grant execute on function public.photo_purge_finalize(uuid) to service_role;
