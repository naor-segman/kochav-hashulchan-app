-- =============================================================================
-- Migration: 20260928000300_internal_functions_and_album_token
-- Depends on: 20260727000001_event_album, 20260811040000_ai_rate_limit
--
-- Two findings of the 28.9 security audit.
--
-- A5 — TWO "INTERNAL" FUNCTIONS WERE PUBLIC.
--   Both were written `revoke all … from public` and left at that, on the
--   belief that this made them internal. On Supabase it does not: the project's
--   default privileges grant EXECUTE on every new function in `public` to anon
--   and authenticated BY NAME, and revoking from the PUBLIC pseudo-role leaves
--   those direct grants standing. So, callable by anyone with the anon key:
--     album_event_id(text) — resolves an album token to the event's cloud id
--     prune_ai_usage()     — a SECURITY DEFINER DELETE on ai_usage
--   Neither is called from the client. album_event_id is called only from
--   inside album_list_by_token and album_add_photo, which are SECURITY DEFINER
--   and run as their owner, so revoking the caller's grant does not reach them.
--
-- B7 — THE ALBUM TOKEN WAS NOT UNIQUE.
--   rsvp/invite/gift/hostess/collab tokens are columns with unique indexes
--   (20260716000000, 20260723000002). The album token lives only in the
--   payload, which its owner writes freely, and album_event_id resolves it with
--   `limit 1`. So a host who copied another event's album link into their own
--   payload made the lookup ambiguous — and whichever row Postgres returned
--   first received the other couple's guests' uploads. The same missing index
--   made every album lookup a scan of every event (audit A6).
--
--   The unique expression index closes both. Duplicating an event already mints
--   fresh tokens (eventHelpers.js), so no legitimate write produces a clash.
--   If duplicates already exist this migration STOPS rather than choosing which
--   couple keeps the link — a person decides. The query to find them is below.
-- =============================================================================

revoke execute on function public.album_event_id(text) from anon, authenticated;
revoke execute on function public.prune_ai_usage()     from anon, authenticated;

do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select payload ->> 'albumToken'
    from public.events
    where payload ->> 'albumToken' is not null
    group by 1 having count(*) > 1
  ) d;
  if dupes > 0 then
    raise exception
      '% album token(s) are shared by more than one event. Resolve by hand before re-running: select payload->>''albumToken'' t, array_agg(id) from public.events where payload->>''albumToken'' is not null group by 1 having count(*) > 1;',
      dupes;
  end if;
end $$;

create unique index if not exists idx_events_album_token
  on public.events ((payload ->> 'albumToken'))
  where payload ->> 'albumToken' is not null;

comment on index public.idx_events_album_token is
  'One event per album token. Without it album_event_id() resolved an ambiguous token with LIMIT 1 — see 20260928000300.';
