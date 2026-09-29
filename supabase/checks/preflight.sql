-- PREFLIGHT — read-only. Run BEFORE the 16 pending migrations.
-- Every row with blocks = true must show found = 0 before you start.
with
req(kind, name, present) as (values
  ('function', 'album_event_id(text)',                         to_regprocedure('public.album_event_id(text)') is not null),
  ('function', 'prune_ai_usage()',                             to_regprocedure('public.prune_ai_usage()') is not null),
  ('function', 'album_list_by_token(text)',                    to_regprocedure('public.album_list_by_token(text)') is not null),
  ('function', 'public_event_by_token(text,text)',             to_regprocedure('public.public_event_by_token(text,text)') is not null),
  ('function', 'collab_event_by_token(text)',                  to_regprocedure('public.collab_event_by_token(text)') is not null),
  ('function', 'collab_is_active(events)',                     to_regprocedure('public.collab_is_active(public.events)') is not null),
  ('function', 'hostess_writes_active(events)',                to_regprocedure('public.hostess_writes_active(public.events)') is not null),
  ('function', 'submit_gift_by_token(text,text,bigint,text)',  to_regprocedure('public.submit_gift_by_token(text,text,bigint,text)') is not null),
  ('table',    'album_photos',                                 to_regclass('public.album_photos') is not null),
  ('table',    'ai_usage',                                     to_regclass('public.ai_usage') is not null),
  ('column',   'events.version',              exists (select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='version')),
  ('column',   'subscriptions.is_manually_managed', exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='is_manually_managed')),
  ('column',   'gifts.hidden',                exists (select 1 from information_schema.columns where table_schema='public' and table_name='gifts' and column_name='hidden')),
  ('function', 'submit_rsvp_by_token(8 args)', to_regprocedure('public.submit_rsvp_by_token(text,text,text,text,integer,text[],text,text)') is not null),
  ('function', 'album_add_photo(text,text,text)', to_regprocedure('public.album_add_photo(text,text,text)') is not null),
  ('function', 'album_folder_has_room(text)',  to_regprocedure('public.album_folder_has_room(text)') is not null),
  ('function', 'photo_purge_due(integer)',     to_regprocedure('public.photo_purge_due(integer)') is not null),
  ('function', 'collab_upsert_by_token(text,jsonb)', to_regprocedure('public.collab_upsert_by_token(text,jsonb)') is not null),
  ('function', 'collab_is_active(events)',     to_regprocedure('public.collab_is_active(public.events)') is not null),
  ('table',    'collab_guests',                to_regclass('public.collab_guests') is not null),
  ('function', 'storage.foldername(text)',     to_regprocedure('storage.foldername(text)') is not null)
),
already(name, present) as (values
  ('subscriptions.stripe_checkout_session_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='stripe_checkout_session_id')),
  ('subscriptions.event_id',                   exists (select 1 from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='event_id')),
  ('album_photos.hidden',                      exists (select 1 from information_schema.columns where table_schema='public' and table_name='album_photos' and column_name='hidden')),
  ('idx_events_album_token',                   to_regclass('public.idx_events_album_token') is not null),
  ('gifts.client_key',                         exists (select 1 from information_schema.columns where table_schema='public' and table_name='gifts' and column_name='client_key')),
  ('submit_gift_by_token 5-arg',               to_regprocedure('public.submit_gift_by_token(text,text,bigint,text,text)') is not null),
  ('hostess_mark_arrival_by_token 4-arg',      to_regprocedure('public.hostess_mark_arrival_by_token(text,text,jsonb,jsonb)') is not null),
  ('guest_write_throttle',                     to_regclass('public.guest_write_throttle') is not null),
  ('safe_iso_date',                            to_regprocedure('public.safe_iso_date(text)') is not null),
  ('ck_collab_phone_len',                      exists (select 1 from pg_constraint where conname = 'ck_collab_phone_len')),
  ('trg_events_version_monotone',              exists (select 1 from pg_trigger where tgname = 'trg_events_version_monotone'))
),
phone_checks as (
  select conname, pg_get_constraintdef(oid) as def from pg_constraint
   where conrelid = to_regclass('public.collab_guests') and contype = 'c'
     and pg_get_constraintdef(oid) ~* 'phone'
     and conname not in ('collab_guests_phone_check', 'ck_collab_phone_len')
),
stray_insert_policies as (
  select policyname, coalesce(with_check, qual) as rule from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'ALL')
     and coalesce(with_check, qual, '') ~ '(event-album|event-site)'
     and policyname not in ('album_objects_insert', 'event_site_objects_insert')
),
old_album_paths as (
  select p.event_id, count(*) as n from public.album_photos p
   where p.storage_path not like p.event_id::text || '/' || p.album_token || '/%'
   group by 1
),
dup_album as (
  select e.payload->>'albumToken' as tok, array_agg(e.id order by e.created_at) as ids
    from public.events e
   where e.payload->>'albumToken' is not null
   group by 1 having count(*) > 1
),
long_album as (
  select id, octet_length(payload->>'albumToken') as len
    from public.events where octet_length(payload->>'albumToken') > 2000
),
bad_gift as (
  select id, event_id, amount from public.gifts where amount < 500 or amount > 10000000
),
live_unflagged as (
  select s.id, s.user_id, s.plan, s.status
    from public.subscriptions s
   where s.status in ('active', 'trialing')
     and (s.expires_at is null or s.expires_at > now())
     and s.is_manually_managed = false
     and s.plan <> 'free'
),
door_guests as (
  select e.id as event_id, g->>'id' as guest_id,
         case when g ? 'count' and jsonb_typeof(g->'count') <> 'null'
                   and (g->>'count') !~ '^\s*[-+]?[0-9]{1,9}\s*$' then 'count=' || (g->>'count')
              else 'arrived=' || (g->>'arrived') end as why
    from public.events e,
         jsonb_array_elements(case when jsonb_typeof(e.payload->'guests') = 'array' then e.payload->'guests' else '[]'::jsonb end) g
   where e.hostess_token is not null
     and (   (g ? 'count' and jsonb_typeof(g->'count') <> 'null' and (g->>'count') !~ '^\s*[-+]?[0-9]{1,9}\s*$')
          or (g ? 'arrived' and jsonb_typeof(g->'arrived') <> 'null'
              and lower(btrim(g->>'arrived')) not in ('t','tr','tru','true','y','ye','yes','on','1',
                                                     'f','fa','fal','fals','false','n','no','of','off','0')))
),
door_events as (
  select id from public.events
   where hostess_token is not null and payload ? 'guests' and jsonb_typeof(payload->'guests') not in ('array', 'null')
)
select * from (
  select 1 as n, 'required objects missing (the pending files reference them)' as check_name, true as blocks,
         (select count(*) from req where not present) as found,
         (select string_agg(kind || ' ' || name, ', ') from req where not present) as detail
  union all
  select 2, 'album token shared by >1 event (20260928000300 stops)', true,
         (select count(*) from dup_album),
         (select string_agg(tok || ' → ' || ids::text, '; ') from dup_album)
  union all
  select 3, 'album token longer than 2000 bytes (unique index may refuse it)', true,
         (select count(*) from long_album),
         (select string_agg(id || ' (' || len || ' bytes)', ', ') from long_album)
  union all
  select 4, 'gift amount outside 500..10,000,000 agorot (20260929000000 CHECK fails)', true,
         (select count(*) from bad_gift),
         (select string_agg(id || ' amount=' || amount, ', ') from (select * from bad_gift limit 20) b)
  union all
  select 5, 'current ck_gift_amount_range (info)', false,
         (select count(*) from pg_constraint where conname = 'ck_gift_amount_range' and conrelid = 'public.gifts'::regclass),
         (select string_agg(pg_get_constraintdef(oid), ' | ')
            from pg_constraint where conname = 'ck_gift_amount_range' and conrelid = 'public.gifts'::regclass)
  union all
  select 6, 'paid rows that will grant NOTHING after the new client ships (event_id NULL, is_manually_managed false) — decide per row', false,
         (select count(*) from live_unflagged),
         (select string_agg(l.plan || '/' || l.status || ' ' || coalesce(p.email, l.user_id::text) || ' sub=' || l.id, '; ')
            from live_unflagged l left join public.profiles p on p.id = l.user_id)
  union all
  select 7, 'door: guests the hostess RPC cannot parse (count / arrived shape) — that family cannot be checked in', false,
         (select count(*) from door_guests),
         (select string_agg(event_id || '/' || guest_id || ' ' || why, '; ') from (select * from door_guests limit 20) d)
  union all
  select 8, 'door: events whose payload.guests is not an array (hostess RPC raises)', false,
         (select count(*) from door_events),
         (select string_agg(id::text, ', ') from door_events)
  union all
  select 9, 'pending objects ALREADY present (a partial earlier run — safe, all files are re-runnable in order)', false,
         (select count(*) from already where present),
         (select string_agg(name, ', ') from already where present)
  union all
  select 11, 'collab_guests: a phone CHECK under another name (20260930000200 drops only collab_guests_phone_check — this one would keep the 20-char limit)', true,
         (select count(*) from phone_checks),
         (select string_agg(conname || ': ' || def, '; ') from phone_checks)
  union all
  select 12, 'storage: an extra INSERT policy on the album/site buckets (policies are OR-ed — a leftover one keeps the hole open after 20260930000000)', true,
         (select count(*) from stray_insert_policies),
         (select string_agg(policyname || ': ' || rule, '; ') from stray_insert_policies)
  union all
  select 13, 'album photos stored under the old <event>/<file> path (info: they stay visible; only NEW uploads use <event>/<albumToken>/)', false,
         (select coalesce(sum(n), 0) from old_album_paths),
         (select count(*) || ' events' from old_album_paths)
  union all
  select 10, 'row counts (save this; compare with the postflight)', false, null,
         'events=' || (select count(*) from public.events) || ' gifts=' || (select count(*) from public.gifts) ||
         ' album_photos=' || (select count(*) from public.album_photos) || ' subscriptions=' || (select count(*) from public.subscriptions) ||
         ' rsvp_responses=' || (select count(*) from public.rsvp_responses) || ' collab_guests=' || (select count(*) from public.collab_guests) ||
         ' guest_submissions=' || (select count(*) from public.guest_submissions) || ' profiles=' || (select count(*) from public.profiles)
) x order by n;
