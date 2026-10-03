-- =============================================================================
-- Migration: 20261004000000_abuse_caps
-- Depends on: 20260524000000 (events, is_admin), 20260524000002 (app_settings),
--             20260811040000 + 20261001000000 (ai_usage, claim_ai_call)
--
-- Two ceilings the server never had (audit 3.10, S1 and S4).
--
-- S1  A signed-in account could write as many events, as large, as it liked.
--     The insert policy checks only `user_id = auth.uid()`; the 500 in the app
--     (CLOUD_EVENTS_LIMIT) is a READ limit in the browser. The audit inserted
--     five 9.6 MB events as one user with curl. Now a trigger refuses, for a
--     host's own writes through the API:
--       • the 501st event of one account          (max_events_per_user, 500)
--       • one event's payload above 8 MB           (max_event_payload_bytes)
--       • an account's events above 100 MB stored  (max_user_payload_bytes)
--     Measured before choosing (qa/abuseCapsSql.mjs builds them with the app's
--     own normalizeEvent + cloud mapper): a 2,500-guest wedding with every
--     field filled is 1.48 MB of payload text and 0.56 MB stored; the same
--     event with 13 photos embedded as base64 (guest mode, before the first
--     sync) is 4.5 MB — and a browser's localStorage, where every event lives
--     first, holds about 5 million characters for ALL of them. 500 matches the
--     app's read limit, so a full account is never cut off on load.
--
--     NOTHING EXISTING BREAKS. A trigger, not a CHECK: rows already above a
--     ceiling stay, and stay editable — an update is refused only when it
--     GROWS an event that is (or would be) over a ceiling. Shrinking always
--     passes. Only writes made as `authenticated` (a host through the API) are
--     checked; the door and shared-table functions run as their owner, the
--     edge functions as service_role, the SQL editor as postgres, and an
--     admin's own writes are exempt.
--
--     The error says `event_quota:<count|size|total>` (the app keys its Hebrew
--     message on that) with a Hebrew HINT. The event stays on the host's device.
--
-- S4  The AI floor-plan reading had per-user limits only (10 an hour, 30 a
--     day), and every signed-up account gets them: the Anthropic key is live.
--     claim_ai_call now also refuses past a GLOBAL ceiling per 24 hours
--     (ai_daily_global_cap, 300), raised as 53400 'global ai limit reached'.
--
-- THE CEILINGS ARE SETTINGS, not constants — raise one with an UPDATE:
--   update public.app_settings set ai_daily_global_cap = 500
--    where id = '00000000-0000-0000-0000-000000000001';
--
-- Safe to run more than once: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE,
-- DROP TRIGGER IF EXISTS + CREATE, CREATE INDEX IF NOT EXISTS.
-- Checks: supabase/checks/preflight_20261004.sql (FIRST, read-only) and
-- postflight_20261004.sql. Replayed by qa/abuseCapsSql.mjs.
-- =============================================================================

-- ── 1. The ceilings, as settings ─────────────────────────────────────────────
alter table public.app_settings
  add column if not exists max_events_per_user     integer not null default 500,
  add column if not exists max_event_payload_bytes bigint  not null default 8000000,
  add column if not exists max_user_payload_bytes  bigint  not null default 100000000,
  add column if not exists ai_daily_global_cap     integer not null default 300;

-- app_settings is admin-only under RLS; the trigger runs as the host. This
-- returns the four numbers and nothing else (none of them is a secret), with
-- the defaults if the settings row is missing.
create or replace function public.usage_caps()
returns table (max_events integer, max_payload_bytes bigint, max_user_bytes bigint, ai_daily_global integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(s.max_events_per_user, 500),
         coalesce(s.max_event_payload_bytes, 8000000),
         coalesce(s.max_user_payload_bytes, 100000000),
         coalesce(s.ai_daily_global_cap, 300)
    from (select 1) one
    left join public.app_settings s on s.id = '00000000-0000-0000-0000-000000000001';
$$;
revoke all on function public.usage_caps() from public, anon;
grant execute on function public.usage_caps() to authenticated, service_role;

-- ── 2. S1 — the events trigger ───────────────────────────────────────────────
-- SECURITY INVOKER on purpose: `current_user` must be the WRITER. Its reads of
-- public.events run under the writer's RLS, which for a host is exactly their
-- own rows — the rows being counted.
create or replace function public.events_enforce_caps()
returns trigger language plpgsql volatile set search_path = public, pg_temp as $$
declare
  c        record;
  n        integer;
  new_size bigint;
  old_size bigint;
  stored   bigint;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  select * into c from public.usage_caps();

  -- (a) How many events. Serialised per account, or two creates at 499 both
  -- pass. Under READ COMMITTED the count below is a new statement, so after
  -- the lock it sees the other create's committed row.
  if tg_op = 'INSERT' or new.user_id is distinct from old.user_id then
    perform pg_advisory_xact_lock(hashtextextended('events:' || coalesce(new.user_id::text, ''), 0));
    select count(*) into n from public.events
     where user_id = new.user_id and id is distinct from new.id;
    if n >= c.max_events and not public.is_admin() then
      raise exception 'event_quota:count — at most % events per account', c.max_events
        using hint = format('הגעתם למספר האירועים המרבי בחשבון (%s).', c.max_events);
    end if;
  end if;

  -- (b) One event's size — the text the client sent, as the preflight measures.
  new_size := coalesce(octet_length(new.payload::text), 0);
  if new_size > c.max_payload_bytes then
    if tg_op = 'UPDATE' then old_size := coalesce(octet_length(old.payload::text), 0); end if;
    if (tg_op = 'INSERT' or new_size > old_size) and not public.is_admin() then
      raise exception 'event_quota:size — payload is % bytes, the ceiling is %', new_size, c.max_payload_bytes
        using hint = 'האירוע גדול מכדי להישמר בענן.';
    end if;
  end if;

  -- (c) The account's total, as stored on disk (pg_column_size reads the
  -- stored, compressed size without unpacking any row).
  select coalesce(sum(pg_column_size(payload)), 0) into stored
    from public.events where user_id = new.user_id and id is distinct from new.id;
  if stored + new_size > c.max_user_bytes then
    if tg_op = 'UPDATE' and old_size is null then old_size := coalesce(octet_length(old.payload::text), 0); end if;
    if (tg_op = 'INSERT' or new_size > old_size) and not public.is_admin() then
      raise exception 'event_quota:total — the account holds % bytes, the ceiling is %', stored + new_size, c.max_user_bytes
        using hint = 'נגמר מקום האחסון בענן בחשבון.';
    end if;
  end if;

  return new;
end; $$;
revoke all on function public.events_enforce_caps() from public, anon, authenticated;

drop trigger if exists trg_events_enforce_caps on public.events;
create trigger trg_events_enforce_caps
  before insert or update on public.events
  for each row execute function public.events_enforce_caps();

-- ── 3. S4 — claim_ai_call with a global ceiling ──────────────────────────────
-- The body of 20261001000000 (per-user lock, 10/hour, 30/day, clamped
-- arguments) plus the global count. Locks are always taken in the same order —
-- the user's, then the global one — so two claims cannot deadlock.
create index if not exists ai_usage_created_at on public.ai_usage (created_at);

CREATE OR REPLACE FUNCTION public.claim_ai_call(
  call_kind  text,
  per_hour   int DEFAULT 10,
  per_day    int DEFAULT 30
)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  uid         uuid := auth.uid();
  used_hour   int;
  used_day    int;
  used_global int;
  global_cap  int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF call_kind IS NULL OR char_length(call_kind) = 0 OR char_length(call_kind) > 64 THEN
    RAISE EXCEPTION 'call kind required';
  END IF;

  per_hour := greatest(1, least(COALESCE(per_hour, 10), 100));
  per_day  := greatest(1, least(COALESCE(per_day,  30), 500));

  PERFORM pg_advisory_xact_lock(hashtextextended('ai:' || uid::text || ':' || call_kind, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ai:global', 0));

  -- Every kind, every account: this is the bill, not one host's share of it.
  SELECT ai_daily_global INTO global_cap FROM public.usage_caps();
  SELECT count(*) INTO used_global FROM public.ai_usage
   WHERE created_at > now() - interval '1 day';
  IF used_global >= global_cap THEN
    RAISE EXCEPTION 'global ai limit reached' USING ERRCODE = '53400',
      HINT = 'שירות הזיהוי האוטומטי עמוס היום.';
  END IF;

  WITH ins AS (
    INSERT INTO public.ai_usage (user_id, kind)
    SELECT uid, call_kind
    WHERE (SELECT count(*) FROM public.ai_usage
            WHERE user_id = uid AND kind = call_kind
              AND created_at > now() - interval '1 hour') < per_hour
      AND (SELECT count(*) FROM public.ai_usage
            WHERE user_id = uid AND kind = call_kind
              AND created_at > now() - interval '1 day') < per_day
    RETURNING 1
  )
  SELECT count(*)::int INTO used_hour FROM ins;

  IF used_hour = 0 THEN
    RAISE EXCEPTION 'rate limit reached' USING ERRCODE = '53400';
  END IF;

  SELECT count(*) INTO used_hour FROM public.ai_usage
   WHERE user_id = uid AND kind = call_kind AND created_at > now() - interval '1 hour';
  SELECT count(*) INTO used_day FROM public.ai_usage
   WHERE user_id = uid AND kind = call_kind AND created_at > now() - interval '1 day';

  RETURN least(per_hour - used_hour, per_day - used_day);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_call(text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_ai_call(text, int, int) TO authenticated;
