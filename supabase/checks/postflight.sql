-- POSTFLIGHT — read-only. Run AFTER all 16. Every row must say ok = true.
with c(n, check_name, ok, detail) as (
  select 1, '0000: subscriptions.stripe_checkout_session_id + stripe_payment_intent_id are UNIQUE',
    (select count(*) = 2 from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.conrelid = 'public.subscriptions'::regclass and k.contype = 'u' and array_length(k.conkey, 1) = 1
        and a.attname in ('stripe_checkout_session_id', 'stripe_payment_intent_id')), null
  union all
  select 2, '0000: subscriptions.event_id → events(id) ON DELETE SET NULL',
    (select count(*) = 1 from pg_constraint where conrelid = 'public.subscriptions'::regclass and contype = 'f'
             and confrelid = 'public.events'::regclass and confdeltype = 'n'), null
  union all
  select 3, '0100: album_photos.hidden boolean NOT NULL DEFAULT false',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'album_photos'
             and column_name = 'hidden' and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false'), null
  union all
  select 4, '0100: authenticated may UPDATE album_photos.hidden only; anon may not UPDATE',
    case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'album_photos' and column_name = 'hidden')
    then has_column_privilege('authenticated', 'public.album_photos', 'hidden', 'UPDATE') else false end
    and not has_column_privilege('authenticated', 'public.album_photos', 'storage_path', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.album_photos', 'album_token', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.album_photos', 'event_id', 'UPDATE')
    and not has_table_privilege('anon', 'public.album_photos', 'UPDATE')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'album_photos'
                 and policyname = 'album_photos_owner_update' and with_check is not null), null
  union all
  select 5, '0100: album_list_by_token leaves hidden photos out',
    coalesce((select prosrc ~ 'not p\.hidden' from pg_proc where oid = to_regprocedure('public.album_list_by_token(text)')), false), null
  union all
  select 6, '0300: album_event_id and prune_ai_usage not executable by anon/authenticated',
    coalesce(not has_function_privilege('anon', to_regprocedure('public.album_event_id(text)'), 'EXECUTE')
         and not has_function_privilege('authenticated', to_regprocedure('public.album_event_id(text)'), 'EXECUTE')
         and not has_function_privilege('anon', to_regprocedure('public.prune_ai_usage()'), 'EXECUTE')
         and not has_function_privilege('authenticated', to_regprocedure('public.prune_ai_usage()'), 'EXECUTE'), false), null
  union all
  select 7, '0300: unique index on payload->>albumToken',
    exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.idx_events_album_token') and i.indisunique and i.indisvalid), null
  union all
  select 8, '0500: public_event_by_token is the per-page version (rsvp gets gift_token, no phone)',
    coalesce((select prosrc ~ 'jsonb_strip_nulls' and prosrc ~ '''invite'', ''gift'', ''rsvp''' and prosrc ~ 'album_token'
       from pg_proc where oid = to_regprocedure('public.public_event_by_token(text,text)')), false), null
  union all
  select 9, '0600: collab_event_by_token serves custom_groups',
    coalesce((select prosrc ~ 'custom_groups' from pg_proc where oid = to_regprocedure('public.collab_event_by_token(text)')), false), null
  union all
  select 10, '0929: hostess 4-arg locks the row and reads legacy arrived:true',
    coalesce((select prosrc ~* 'for update' and prosrc ~ 'legacy_all'
       from pg_proc where oid = to_regprocedure('public.hostess_mark_arrival_by_token(text,text,jsonb,jsonb)')), false), null
  union all
  select 11, '0929: gift 5-arg takes the advisory lock; 4-arg delegates to it',
    coalesce((select prosrc ~ 'pg_advisory_xact_lock' from pg_proc where oid = to_regprocedure('public.submit_gift_by_token(text,text,bigint,text,text)')), false)
    and coalesce((select prosrc ~ 'null::text' and prosrc !~ 'insert into' from pg_proc where oid = to_regprocedure('public.submit_gift_by_token(text,text,bigint,text)')), false), null
  union all
  select 12, '0929: ck_gift_amount_range is 500..10,000,000 and VALIDATED',
    exists (select 1 from pg_constraint where conrelid = 'public.gifts'::regclass and conname = 'ck_gift_amount_range' and convalidated
             and pg_get_constraintdef(oid) = 'CHECK (((amount >= 500) AND (amount <= 10000000)))'),
    (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.gifts'::regclass and conname = 'ck_gift_amount_range')
  union all
  select 13, '0929: gifts.client_key + unique (event_id, client_key); 0900: idx_gifts_event_created',
    exists (select 1 from pg_index where indexrelid = to_regclass('public.uq_gifts_event_client_key') and indisunique)
    and to_regclass('public.idx_gifts_event_created') is not null, null
  union all
  select 14, 'the guest RPCs are executable by anon and authenticated',
    (select coalesce(bool_and(coalesce(has_function_privilege('anon', to_regprocedure(f), 'EXECUTE')
                              and has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE'), false)), false)
       from unnest(array['public.submit_gift_by_token(text,text,bigint,text,text)', 'public.submit_gift_by_token(text,text,bigint,text)',
                         'public.hostess_mark_arrival_by_token(text,text,jsonb,jsonb)', 'public.hostess_mark_arrival_by_token(text,text,jsonb)',
                         'public.public_event_by_token(text,text)', 'public.collab_event_by_token(text)', 'public.album_list_by_token(text)',
                         'public.album_add_photo(text,text,text)',
                         'public.submit_rsvp_by_token(text,text,text,text,integer,text[],text,text)']) f), null
  union all
  select 15, 'every SECURITY DEFINER function in public pins search_path',
    not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
                 and not exists (select 1 from unnest(coalesce(proconfig, '{}')) s where s like 'search_path=%')),
    (select string_agg(oid::regprocedure::text, ', ') from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
       and not exists (select 1 from unnest(coalesce(proconfig, '{}')) s where s like 'search_path=%'))
  union all
  select 17, '0930-0: guest_throttle exists, RLS on its table, callable by no guest role',
    to_regclass('public.guest_write_throttle') is not null
    and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.guest_write_throttle')), false)
    and coalesce(not has_function_privilege('anon', to_regprocedure('public.guest_throttle(text,uuid,integer,integer)'), 'EXECUTE')
             and not has_function_privilege('authenticated', to_regprocedure('public.guest_throttle(text,uuid,integer,integer)'), 'EXECUTE'), false)
    and not has_table_privilege('anon', 'public.guest_write_throttle', 'SELECT'), null
  union all
  select 18, '0930-0: gift 5-arg is throttled per sender (not the old 60/min per event) and still locks',
    coalesce((select prosrc ~ 'guest_throttle\(''gift''' and prosrc ~ 'pg_advisory_xact_lock'
       from pg_proc where oid = to_regprocedure('public.submit_gift_by_token(text,text,bigint,text,text)')), false), null
  union all
  select 19, '0930-0: rsvp 8-arg locks and is throttled',
    coalesce((select prosrc ~ 'guest_throttle\(''rsvp''' and prosrc ~ 'pg_advisory_xact_lock'
       from pg_proc where oid = to_regprocedure('public.submit_rsvp_by_token(text,text,text,text,integer,text[],text,text)')), false), null
  union all
  select 20, '0930-0: album uploads need <event>/<albumToken>/, and are the ONLY insert rule on the album bucket',
    exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'album_objects_insert'
             and with_check ~ 'album_folder_token_ok' and with_check ~ 'album_folder_has_room')
    and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'ALL')
             and coalesce(with_check, qual, '') ~ 'event-album' and policyname <> 'album_objects_insert'),
    (select string_agg(policyname, ', ') from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'ALL') and coalesce(with_check, qual, '') ~ 'event-album')
  union all
  select 21, '0930-0: album_add_photo checks the token folder and refuses .. // and backslash',
    coalesce((select prosrc ~ 'token_value \|\| ''/''' and prosrc ~ '%\.\.%' and prosrc ~ '%//%'
       from pg_proc where oid = to_regprocedure('public.album_add_photo(text,text,text)')), false), null
  union all
  select 22, '0930-0: event-site uploads capped (site_folder_has_room), the ONLY insert rule on the site bucket',
    exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'event_site_objects_insert'
             and with_check ~ 'site_folder_has_room')
    and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'ALL')
             and coalesce(with_check, qual, '') ~ 'event-site' and policyname <> 'event_site_objects_insert'), null
  union all
  select 23, '0930-1: photo_purge_due reads dates through safe_iso_date',
    to_regprocedure('public.safe_iso_date(text)') is not null
    and coalesce((select prosrc ~ 'safe_iso_date' from pg_proc where oid = to_regprocedure('public.photo_purge_due(integer)')), false)
    and coalesce(not has_function_privilege('anon', to_regprocedure('public.photo_purge_due(integer)'), 'EXECUTE'), false), null
  union all
  select 24, '0930-2: collab phone up to 40 — ck_collab_phone_len is the only phone CHECK, and the token upsert clips at 40',
    exists (select 1 from pg_constraint where conrelid = 'public.collab_guests'::regclass and conname = 'ck_collab_phone_len' and convalidated
             and pg_get_constraintdef(oid) ~ '<= 40')
    and not exists (select 1 from pg_constraint where conrelid = 'public.collab_guests'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ~* 'phone' and conname <> 'ck_collab_phone_len')
    and coalesce((select prosrc ~* 'left\([^;]*phone[^;]*40\)' from pg_proc where oid = to_regprocedure('public.collab_upsert_by_token(text,jsonb)')), false),
    (select string_agg(conname || ': ' || pg_get_constraintdef(oid), '; ') from pg_constraint
      where conrelid = 'public.collab_guests'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~* 'phone')
  union all
  select 25, '0930-3: events.version can only go up (trigger enabled)',
    exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'trg_events_version_monotone'
             and tgenabled = 'O' and not tgisinternal), null
  union all
  select 16, 'row counts (compare with the preflight row 10 — must be equal)', null::boolean,
    'events=' || (select count(*) from public.events) || ' gifts=' || (select count(*) from public.gifts) ||
    ' album_photos=' || (select count(*) from public.album_photos) || ' subscriptions=' || (select count(*) from public.subscriptions) ||
    ' rsvp_responses=' || (select count(*) from public.rsvp_responses) || ' collab_guests=' || (select count(*) from public.collab_guests) ||
    ' guest_submissions=' || (select count(*) from public.guest_submissions) || ' profiles=' || (select count(*) from public.profiles)
)
select n, check_name, ok, detail from c
union all
select 99, 'ALL CHECKS PASS', bool_and(coalesce(ok, true)), null from c
order by n;
