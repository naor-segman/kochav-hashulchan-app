-- =============================================================================
-- Migration: 20260928000800_gift_floor_server
-- Depends on: 20260728000000_public_write_hardening
--
-- WORKPLAN י2: the ₪50 minimum was enforced in the browser only.
--
--   - submit_gift_by_token accepted `amount >= 500` agorot — ₪5.
--   - The table CHECK ck_gift_amount_range was created by 20260728000000 as
--     `amount between 500 and 10000000`. 20260811030000 tried to raise it to
--     5000, but it adds a constraint only when none of that NAME exists — and
--     one did — so the ₪50 version never took effect.
--   - The RPC kept up to 1,000 characters of message; the gift page allows
--     600, and the projected wall was designed around that.
--
-- So a direct call to the anon RPC could declare ₪5 and put 1,000 characters
-- on the wall in front of the hall. Now: ₪50 and 600, in the function and in
-- the table. The CHECK is replaced NOT VALID: existing rows (all of them
-- declarations, nothing charged) are not re-checked; new writes are.
-- Verified against a real Postgres by qa/giftFloorSql.mjs.
-- =============================================================================

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

  insert into public.gifts (event_id, donor_name, amount, message, paid)
  values (ev_id, left(trim(donor_name), 200), amount,
          -- 600, the gift page's own limit (GiftScreen MESSAGE_MAX). Was 1000.
          nullif(left(trim(coalesce(message, '')), 600), ''), false);
end; $$;

revoke all on function public.submit_gift_by_token(text, text, bigint, text) from public;
grant execute on function public.submit_gift_by_token(text, text, bigint, text) to anon, authenticated;

alter table public.gifts drop constraint if exists ck_gift_amount_range;
alter table public.gifts add constraint ck_gift_amount_range
  check (amount >= 5000 and amount <= 10000000) not valid;
