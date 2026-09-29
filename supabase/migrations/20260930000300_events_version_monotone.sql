-- =============================================================================
-- Migration: 20260930000300_events_version_monotone
-- Depends on: the events.version column (optimistic concurrency, 2026-08)
--
-- THE CLOUD'S VERSION COULD GO DOWN (30.9 multi-device review, reproduced in a
-- browser with two host devices and a greeter; סב46).
--
-- The client pushes `update … set version = <its local counter> where version
-- = <its base>`. The greeter's door RPC raises the cloud version without
-- raising any device's counter, so a device's counter can be BELOW the row's.
-- Its next push, matching on the base, wrote that lower number over the row —
-- and any other device whose base happened to equal it was then accepted
-- WITHOUT a conflict, writing a stale copy over guests the cloud had already
-- taken. Measured: two guests added on the laptop, both accepted by the cloud,
-- gone after the phone's push. In a 300-seed fuzz, 39 runs saw the version
-- fail to rise, and every lost guest, lost arrival mark and revoked link that
-- came back traced to it; forcing the version up removed all of them.
--
-- So the row's version only ever rises: an UPDATE that does not raise it gets
-- the old version + 1. Every writer returns or re-reads the stored version
-- (updateCloudEvent selects it back), so a client learns the real number.
--
-- Verified by qa/guestWriteHardeningSql.mjs.
-- =============================================================================

create or replace function public.events_version_monotone()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.version is null or new.version <= coalesce(old.version, 0) then
    new.version := coalesce(old.version, 0) + 1;
  end if;
  return new;
end; $$;

revoke all on function public.events_version_monotone() from public, anon, authenticated;

drop trigger if exists trg_events_version_monotone on public.events;
create trigger trg_events_version_monotone
  before update on public.events
  for each row execute function public.events_version_monotone();
