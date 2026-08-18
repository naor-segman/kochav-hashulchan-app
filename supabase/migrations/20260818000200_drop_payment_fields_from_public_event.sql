-- ─────────────────────────────────────────────────────────────────────────────
-- public_event_by_token: stop broadcasting the host's payment details
--
-- THE LEAK. 20260728000000 carefully gated the sibling tokens per token type —
-- the album QR must not also unlock RSVP — and left these two OUTSIDE the CASE:
--
--     'bit_phone', e.payload->>'giftBitPhone',
--     'paybox_link', e.payload->>'giftPayboxLink',
--
-- So every token type received them: `album` and `hostess` included. The album
-- QR is designed to be photographed off a table in the hall by strangers, and
-- it was handing out the host's personal Bit number and PayBox link.
--
-- AND NOTHING EVER RENDERED THEM. Grepped the whole client: `publicTokens.js`
-- mapped them into its return value and no screen read the result.
-- `GiftScreen` states outright why (11.8) — "a peer-to-peer transfer app
-- charges the HOST the fee on money the product just collected on their
-- behalf" — so the gift page deliberately has no Bit/PayBox route. The only
-- other mention is a demo fixture.
--
-- A field that nothing displays and everything receives is the easiest kind of
-- leak to justify closing: this removes them outright rather than adding a
-- fourth entry to the CASE. The values stay in `events.payload`, so the host's
-- own copy and the cloud round-trip are untouched — this is only about what an
-- anonymous token holder is handed.
--
-- IF THEY ARE EVER NEEDED AGAIN, put them INSIDE the CASE:
--     'bit_phone', case when token_type = 'gift' then e.payload->>'giftBitPhone' end
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.public_event_by_token(token_type text, token_value text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'type', e.type, 'date', e.date, 'venue', e.venue,
    'bride_name', e.payload->>'brideName', 'groom_name', e.payload->>'groomName',
    'celebrant_name', e.payload->>'celebrantName', 'organization_name', e.payload->>'organizationName',
    'contact_name', e.payload->>'contactName', 'owner_name', e.payload->>'ownerName',
    -- Only serve the site once the host has published it.
    'site', case when coalesce((e.payload->'eventSite'->>'enabled')::boolean, false)
                 then e.payload->'eventSite' else null end,
    -- Same rule, per announcement kind: a draft never leaves the database.
    'announcements', (
      select jsonb_object_agg(k, v)
        from jsonb_each(coalesce(e.payload->'announcements', '{}'::jsonb)) as a(k, v)
       where coalesce((v->>'enabled')::boolean, false)
    ),
    -- Sibling tokens only where a page actually links onward. The invite page
    -- is the hub and needs RSVP; the RSVP page links back to the site. The
    -- album and gift pages link to neither, so they get neither. hostess_token
    -- and collab_token are never exposed here — they unlock the full guest list
    -- with phone numbers.
    'rsvp_token',   case when token_type in ('invite', 'rsvp') then e.rsvp_token   end,
    'gift_token',   case when token_type in ('invite', 'gift') then e.gift_token   end,
    'invite_token', case when token_type in ('invite', 'rsvp') then e.invite_token end)
  from public.events e
  where token_value is not null and char_length(token_value) >= 8
    and case token_type
      when 'rsvp'    then e.rsvp_token    = token_value
      when 'invite'  then e.invite_token  = token_value
      when 'gift'    then e.gift_token    = token_value
      when 'hostess' then e.hostess_token = token_value
      when 'album'   then e.payload->>'albumToken' = token_value
      else false end
  limit 1;
$$;
revoke all on function public.public_event_by_token(text, text) from public;
grant execute on function public.public_event_by_token(text, text) to anon, authenticated;

comment on function public.public_event_by_token(text, text) is
  'Public event data for one token. Serves no payment details: see 20260818000200.';
