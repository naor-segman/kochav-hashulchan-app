-- =============================================================================
-- Migration: 20260929000000_review_gift_door_fixes
-- Depends on: 20260928000700_hostess_three_way_arrival,
--             20260928000800_gift_floor_server, 20260928000900_gift_rate_limit
--
-- Four defects the 29.9 review found in those three, each reproduced against a
-- real Postgres + PostgREST before it was fixed here:
--
-- 1. The double-tap guard dropped a DIFFERENT family's gift. It matched "same
--    name, amount and message within 10 minutes" — and "משפחת כהן", ₪360, no
--    message is not one family. Both were told it worked; one row was stored.
--    Now: the page sends a key made once per form (client_key), and a repeat
--    of THAT key is the double tap. A page that sends no key (an old cached
--    one) keeps a name-based guard, cut to 60 seconds.
--
-- 2. The ₪50 CHECK made old gifts un-hideable. NOT VALID skips existing rows
--    only when the constraint is added; every later UPDATE of an old ₪5 row —
--    the host hiding an abusive blessing — was refused (23514). The table goes
--    back to its original 500..10,000,000 range for every row, and ₪50 lives in
--    the function, the only path a guest can insert through.
--
-- 3. Neither gift limit held under simultaneous requests (8 identical at once
--    stored up to 7; 200 different stored 61–67 against 60). The function now
--    takes a per-event advisory lock before it counts. Advisory, not a row
--    lock on events: that would stall the host's own sync on the same row.
--
-- 4. The door write lost a mark when two greeters' requests overlapped on the
--    server: it read the row without a lock and wrote back from a stale read
--    (A marks seat 0, B marks seat 1, result [1]). The token lookup now locks
--    the event row FOR UPDATE, so the second request reads the first's result.
--    And a row from before per-seat check-in (arrived: true, no arrivedSeats)
--    is read as every seat — as the app reads it (arrivedSeatsOf) — instead of
--    none, which made un-ticking one seat clear the whole family.
--
-- Also: blank-name checks use a whitespace trim (a name of just "\n" passed
-- `trim()`, which removes spaces only).
--
-- Verified by qa/giftFloorSql.mjs and qa/hostessThreeWaySql.mjs.
-- =============================================================================

-- ── 2. The table's range back to what every row satisfies ────────────────────
alter table public.gifts drop constraint if exists ck_gift_amount_range;
alter table public.gifts add constraint ck_gift_amount_range
  check (amount >= 500 and amount <= 10000000);

-- ── 1. The double-tap key ─────────────────────────────────────────────────────
alter table public.gifts add column if not exists client_key text;
create unique index if not exists uq_gifts_event_client_key
  on public.gifts (event_id, client_key) where client_key is not null;

create or replace function public.submit_gift_by_token(
  token_value text,
  donor_name  text,
  amount      bigint,
  message     text,
  client_key  text
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  n     int;
  nm    text := left(btrim(coalesce(submit_gift_by_token.donor_name, ''), E' \t\r\n\f\v'), 200);
  msg   text := nullif(left(btrim(coalesce(submit_gift_by_token.message, ''), E' \t\r\n\f\v'), 600), '');
  k     text := nullif(left(btrim(coalesce(submit_gift_by_token.client_key, '')), 64), '');
begin
  if token_value is null or char_length(token_value) < 8 then
    raise exception 'invalid token';
  end if;

  select e.id into ev_id
    from public.events e
   where e.gift_token = token_value
   limit 1;

  if ev_id is null then
    raise exception 'invalid token';
  end if;

  if nm = '' then
    raise exception 'name required';
  end if;

  -- ₪50, the minimum the gift page states (5000 agorot). Here only: the table
  -- CHECK must keep accepting the older rows it already holds.
  if amount is null or amount < 5000 or amount > 10000000 then
    raise exception 'amount out of range';
  end if;

  -- One writer per event from here on, so the counts below are true.
  perform pg_advisory_xact_lock(hashtextextended('gifts:' || ev_id::text, 0));

  -- The double tap. With a key: that key, on this event, already stored.
  if k is not null then
    if exists (select 1 from public.gifts g where g.event_id = ev_id and g.client_key = k) then
      return;
    end if;
  -- Without one (a page from before this migration): identical within 60s.
  elsif exists (
    select 1 from public.gifts g
     where g.event_id = ev_id
       and g.donor_name = nm
       and g.amount = submit_gift_by_token.amount
       and coalesce(g.message, '') = coalesce(msg, '')
       and g.created_at > now() - interval '60 seconds'
  ) then
    return;
  end if;

  select count(*) into n from public.gifts where event_id = ev_id;
  if n >= 5000 then
    raise exception 'limit reached';
  end if;

  select count(*) into n from public.gifts
   where event_id = ev_id and created_at > now() - interval '1 minute';
  if n >= 60 then
    raise exception 'rate limited';
  end if;

  insert into public.gifts (event_id, donor_name, amount, message, paid, client_key)
  values (ev_id, nm, amount, msg, false, k);
end; $$;

revoke all on function public.submit_gift_by_token(text, text, bigint, text, text) from public;
grant execute on function public.submit_gift_by_token(text, text, bigint, text, text) to anon, authenticated;

-- The 4-argument form stays for a page cached before this migration, and runs
-- the same body without a key.
create or replace function public.submit_gift_by_token(
  token_value text,
  donor_name  text,
  amount      bigint,
  message     text
) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.submit_gift_by_token(token_value, donor_name, amount, message, null::text);
end; $$;

revoke all on function public.submit_gift_by_token(text, text, bigint, text) from public;
grant execute on function public.submit_gift_by_token(text, text, bigint, text) to anon, authenticated;

-- ── 4. The door write, serialised per event, reading legacy rows as the app does
create or replace function public.hostess_mark_arrival_by_token(
  token_value text,
  guest_id    text,
  seats       jsonb,
  base        jsonb
)
returns void
language plpgsql volatile security definer set search_path = public
as $$
declare
  ev_id      uuid;
  seat_count int;
  legacy_all boolean;
  want       int[];
  was        int[];
  cur        int[];
  added      int[];
  removed    int[];
  result     jsonb;
  stamp_ms   bigint;
begin
  -- FOR UPDATE: a second greeter's request waits here and then reads the
  -- first one's result, instead of writing back over it from a stale read.
  select e.id into ev_id
  from public.events e
  where token_value is not null
    and char_length(token_value) >= 8
    and e.hostess_token = token_value
    and public.hostess_writes_active(e)
  limit 1
  for update;
  if ev_id is null then raise exception 'invalid token'; end if;

  if guest_id is null or char_length(guest_id) = 0 or char_length(guest_id) > 64 then
    raise exception 'guest id required';
  end if;

  select greatest(1, coalesce((g->>'count')::int, 1)),
         coalesce(jsonb_typeof(g->'arrivedSeats') <> 'array' or g->'arrivedSeats' is null, true)
           and coalesce((g->>'arrived')::boolean, false)
    into seat_count, legacy_all
  from public.events e,
       jsonb_array_elements(coalesce(e.payload->'guests', '[]'::jsonb)) g
  where e.id = ev_id and g->>'id' = guest_id
  limit 1;
  if seat_count is null then raise exception 'guest not found'; end if;

  select coalesce(array_agg(distinct v), '{}') into want from (
    select case when x ~ '^[0-9]{1,3}$' then x::int end as v
    from jsonb_array_elements_text(case when jsonb_typeof(seats) = 'array' then seats else '[]'::jsonb end) as x
  ) s where v >= 0 and v < seat_count;

  select coalesce(array_agg(distinct v), '{}') into was from (
    select case when x ~ '^[0-9]{1,3}$' then x::int end as v
    from jsonb_array_elements_text(case when jsonb_typeof(base) = 'array' then base else '[]'::jsonb end) as x
  ) s where v >= 0 and v < seat_count;

  if legacy_all then
    -- arrived: true from before per-seat check-in = every seat (arrivedSeatsOf).
    cur := array(select generate_series(0, seat_count - 1));
  else
    select coalesce(array_agg(distinct v), '{}') into cur from (
      select case when x ~ '^[0-9]{1,3}$' then x::int end as v
      from public.events e,
           jsonb_array_elements(coalesce(e.payload->'guests', '[]'::jsonb)) g,
           jsonb_array_elements_text(case when jsonb_typeof(g->'arrivedSeats') = 'array'
                                          then g->'arrivedSeats' else '[]'::jsonb end) as x
      where e.id = ev_id and g->>'id' = guest_id
    ) s where v >= 0 and v < seat_count;
  end if;

  -- The two differences first, each on its own — EXCEPT chains associate to
  -- the left, so writing them inline would compute the wrong set.
  added   := array(select unnest(want) except select unnest(was));
  removed := array(select unnest(was)  except select unnest(want));

  select coalesce(jsonb_agg(v order by v), '[]'::jsonb) into result from (
    select distinct v from unnest(cur || added) as v
    where not (v = any (removed))
  ) s;

  stamp_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  update public.events e
  set payload = jsonb_set(
        e.payload,
        '{guests}',
        coalesce((
          select jsonb_agg(
            case when t.g->>'id' = guest_id
              then t.g
                   || jsonb_build_object('arrivedSeats', result)
                   || jsonb_build_object('arrived', to_jsonb(jsonb_array_length(result) > 0))
                   || jsonb_build_object('arrivedAt', to_jsonb(stamp_ms))
              else t.g
            end
            order by t.ord
          )
          from jsonb_array_elements(coalesce(e.payload->'guests', '[]'::jsonb))
               with ordinality as t(g, ord)
        ), '[]'::jsonb)
      ),
      version    = coalesce(e.version, 1) + 1,
      updated_at = now()
  where e.id = ev_id;
end;
$$;

revoke all on function public.hostess_mark_arrival_by_token(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.hostess_mark_arrival_by_token(text, text, jsonb, jsonb) to anon, authenticated;
