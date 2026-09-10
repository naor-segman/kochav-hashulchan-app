-- ─────────────────────────────────────────────────────────────────────────────
-- The blessing wall gets a moderator: the host
--
-- THE HOLE. `submit_gift_by_token` is granted to `anon`, requires only a name
-- and an amount of at least ₪5, and stores a 1,000-character free-text message.
-- `gift_wall_by_token` returns EVERY row with no filter at all. The wall polls
-- every 30 seconds and is designed to be projected on a screen in the hall.
--
-- So anyone holding the gift link — the whole WhatsApp group, and anyone they
-- forwarded it to — could put arbitrary text on the wall at somebody's wedding
-- for a declaration of ₪5 that nobody ever collects. And the host had no way to
-- take it down: `gifts` has an owner SELECT policy and nothing else, so there
-- was no delete path from anywhere in the product.
--
-- Checklist item 1 gave the wall a share link, which made it likelier to be
-- used, and item 2 gave the host a read of the same rows. Neither noticed that
-- the row could not be removed.
--
-- THE FIX, in three parts:
--
--   • `hidden` — the host takes a blessing off the wall while keeping the
--     record. Moderation should not destroy the host's own money list, and a
--     mistaken hide has to be reversible.
--   • the wall filters on it.
--   • owner UPDATE and DELETE policies, so the host can hide, unhide, or remove
--     outright. Scoped through `events.user_id` exactly like the SELECT policy
--     they sit beside.
--
-- `hidden` defaults to false: the wall is opt-out, not opt-in. A host cannot
-- pre-approve blessings arriving during their own wedding, and a wall that
-- shows nothing until someone presses a button is a wall that shows nothing.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.gifts
  add column if not exists hidden boolean not null default false;

comment on column public.gifts.hidden is
  'Host took this blessing off the public wall. The row is kept — it is still '
  'their record of a declared gift. See 20260818000300.';

-- Every wall read goes through this one function, so filtering here is the
-- whole enforcement. The index keeps the projector query cheap on an event with
-- thousands of rows.
create index if not exists gifts_event_visible_idx
  on public.gifts (event_id, created_at desc)
  where not hidden;

create or replace function public.gift_wall_by_token(token_value text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',         g.id,
      'donor_name', g.donor_name,
      'message',    g.message,
      'created_at', g.created_at
    ) order by g.created_at desc)
    from public.gifts g
    where g.event_id = e.id
      and not g.hidden
  ), '[]'::jsonb)
  from public.events e
  where token_value is not null
    and char_length(token_value) >= 8
    and e.gift_token = token_value
  limit 1;
$$;

revoke all on function public.gift_wall_by_token(text) from public;
grant execute on function public.gift_wall_by_token(text) to anon, authenticated;

comment on function public.gift_wall_by_token(text) is
  'Blessings for the public wall. Skips rows the host has hidden; see 20260818000300.';

-- ── The host's controls ──────────────────────────────────────────────────────
--
-- Deliberately NOT granted to anon: these are authenticated, and scoped to
-- events the caller owns. `gifts_owner_select` already establishes that shape.
grant update, delete on public.gifts to authenticated;

drop policy if exists "gifts_owner_update" on public.gifts;
create policy "gifts_owner_update"
  on public.gifts for update to authenticated
  using (exists (
    select 1 from public.events e where e.id = gifts.event_id and e.user_id = auth.uid()
  ))
  -- The same test in WITH CHECK, so a host cannot move a blessing onto somebody
  -- else's wall by rewriting event_id.
  --
  -- Measured: `gifts_owner_select` already refuses that move on its own, so
  -- this clause is not currently what stops it. It stays regardless — a
  -- guarantee that rests on a sibling policy nobody remembers is a guarantee
  -- that vanishes the day that policy is edited — but it is stated here as
  -- defence in depth rather than as the load-bearing check, because that is
  -- what it measured as.
  with check (exists (
    select 1 from public.events e where e.id = gifts.event_id and e.user_id = auth.uid()
  ));

drop policy if exists "gifts_owner_delete" on public.gifts;
create policy "gifts_owner_delete"
  on public.gifts for delete to authenticated
  using (exists (
    select 1 from public.events e where e.id = gifts.event_id and e.user_id = auth.uid()
  ));
