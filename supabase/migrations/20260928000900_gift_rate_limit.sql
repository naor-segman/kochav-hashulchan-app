-- =============================================================================
-- Migration: 20260928000900_gift_rate_limit
-- Depends on: 20260928000800_gift_floor_server
--
-- WORKPLAN כ2: nothing limited how fast gift declarations could be written —
-- the only bound was 5,000 rows per event. Adds, inside submit_gift_by_token:
--   - a double-tap guard (identical declaration within 10 minutes → stored once)
--   - a burst limit of 60 declarations per event per minute
-- and the index both lookups need. Everything else is 20260928000800's body.
--
-- Not per sender: that needs the client's IP from the request headers, which
-- cannot be verified from here. Recorded in WORKPLAN 102.
-- Verified against a real Postgres by qa/giftFloorSql.mjs.
-- =============================================================================

create index if not exists idx_gifts_event_created on public.gifts (event_id, created_at);

create or replace function public.submit_gift_by_token(
  token_value text,
  donor_name  text,
  amount      bigint,
  message     text
) returns void language plpgsql volatile security definer set search_path = public as $$
declare
  ev_id uuid;
  n     int;
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

  if coalesce(trim(donor_name), '') = '' then
    raise exception 'name required';
  end if;

  -- ₪50, the minimum the gift page states (5000 agorot). Was 500 (₪5).
  if amount is null or amount < 5000 or amount > 10000000 then
    raise exception 'amount out of range';
  end if;

  select count(*) into n from public.gifts where event_id = ev_id;
  if n >= 5000 then
    raise exception 'limit reached';
  end if;

  -- A double tap is one gift, not two (20260928000900). Same name, amount and
  -- message on the same event within ten minutes is accepted and not stored
  -- again — two identical lines on the host's list of money is the worse
  -- outcome, and the sender is not told otherwise. Parameters are qualified
  -- with the function name because they share names with the columns.
  if exists (
    select 1 from public.gifts g
     where g.event_id = ev_id
       and g.donor_name = left(trim(submit_gift_by_token.donor_name), 200)
       and g.amount = submit_gift_by_token.amount
       and coalesce(g.message, '') = coalesce(left(trim(coalesce(submit_gift_by_token.message, '')), 600), '')
       and g.created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- A burst limit per event (WORKPLAN כ2). Until now the only bound was the
  -- 5,000-row ceiling, which a script reaches in seconds; 60 a minute is far
  -- above a hall of guests and far below a flood.
  select count(*) into n from public.gifts
   where event_id = ev_id and created_at > now() - interval '1 minute';
  if n >= 60 then
    raise exception 'rate limited';
  end if;

  insert into public.gifts (event_id, donor_name, amount, message, paid)
  values (ev_id, left(trim(donor_name), 200), amount,
          -- 600, the gift page's own limit (GiftScreen MESSAGE_MAX). Was 1000.
          nullif(left(trim(coalesce(message, '')), 600), ''), false);
end; $$;

revoke all on function public.submit_gift_by_token(text, text, bigint, text) from public;
grant execute on function public.submit_gift_by_token(text, text, bigint, text) to anon, authenticated;
