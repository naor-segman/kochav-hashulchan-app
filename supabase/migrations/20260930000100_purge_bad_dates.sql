-- =============================================================================
-- Migration: 20260930000100_purge_bad_dates
-- Depends on: 20260817000000_photo_retention
--
-- photo_purge_due guarded its date casts with a shape regex (^\d{4}-\d{2}-\d{2}$).
-- '2026-02-30' and '2026-13-01' have the shape and are not dates: the cast
-- raised 22008 and the WHOLE scan failed. events.date and
-- payload.eventSite.photosKeepUntil are both written by the event's owner, so
-- one signed-in user saving their own event with such a date disabled the
-- photo purge for every account (30.9 contract review, reproduced through
-- PostgREST; סב43). Same function otherwise — only the two date reads change.
--
-- Verified by qa/photoRetentionSql.mjs.
-- =============================================================================

-- A date, or NULL for anything that is not one. Never raises.
create or replace function public.safe_iso_date(v text)
returns date language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if v is null or v !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return v::date;
exception when others then
  return null;
end; $$;
revoke all on function public.safe_iso_date(text) from public, anon, authenticated;

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
    -- Through safe_iso_date, which answers NULL for anything that is not a real
    -- calendar day. The regex this replaces checked the SHAPE only: '2026-02-30'
    -- passed it, then the cast raised and aborted the whole scan — so any
    -- signed-in user could switch retention off for every account by saving
    -- their own event with that date (30.9 review, סב43). And Postgres does not
    -- promise to evaluate an AND left to right, so a guard in front of a cast
    -- is not a guard. A NULL here means "never due", as the old rule meant for
    -- an event with no date.
    public.safe_iso_date(e.date) <= (public.photo_retention_today() - public.photo_retention_days())
    -- `<=`, NOT `<`: on day 30 the host's banner reads "התמונות נמחקות היום"
    -- (see 20260817000000). A postponement the host asked for outranks it.
    and coalesce(public.safe_iso_date(e.payload->'eventSite'->>'photosKeepUntil'), '-infinity'::date)
        <= public.photo_retention_today()
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

revoke all on function public.photo_purge_due(integer) from public, anon, authenticated;
