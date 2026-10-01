-- בדיקת סיום — קריאה בלבד. להריץ אחרי כל 16 המיגרציות. כל שורה צריכה להראות "תקין" = true.
with c(n, check_name, ok, detail) as (
  select 1, 'רכישה: שני מזהי Stripe ייחודיים',
    (select count(*) = 2 from pg_constraint k join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.conrelid = 'public.subscriptions'::regclass and k.contype = 'u' and array_length(k.conkey, 1) = 1
        and a.attname in ('stripe_checkout_session_id', 'stripe_payment_intent_id')), null
  union all
  select 2, 'רכישה מקושרת לאירוע (ונשארת כרשומה אם האירוע נמחק)',
    (select count(*) = 1 from pg_constraint where conrelid = 'public.subscriptions'::regclass and contype = 'f'
             and confrelid = 'public.events'::regclass and confdeltype = 'n'), null
  union all
  select 3, 'אלבום: עמודת "מוסתרת"',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'album_photos'
             and column_name = 'hidden' and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false'), null
  union all
  select 4, 'אלבום: רק בעל האירוע יכול להסתיר תמונה; אורח לא יכול לשנות כלום',
    case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'album_photos' and column_name = 'hidden')
    then has_column_privilege('authenticated', 'public.album_photos', 'hidden', 'UPDATE') else false end
    and not has_column_privilege('authenticated', 'public.album_photos', 'storage_path', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.album_photos', 'album_token', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.album_photos', 'event_id', 'UPDATE')
    and not has_table_privilege('anon', 'public.album_photos', 'UPDATE')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'album_photos'
                 and policyname = 'album_photos_owner_update' and with_check is not null), null
  union all
  select 5, 'אלבום: תמונות מוסתרות לא מוצגות לאורחים',
    coalesce((select prosrc ~ 'not p\.hidden' from pg_proc where oid = to_regprocedure('public.album_list_by_token(text)')), false), null
  union all
  select 6, 'פונקציות פנימיות חסומות לאורחים ולמשתמשים',
    coalesce(not has_function_privilege('anon', to_regprocedure('public.album_event_id(text)'), 'EXECUTE')
         and not has_function_privilege('authenticated', to_regprocedure('public.album_event_id(text)'), 'EXECUTE')
         and not has_function_privilege('anon', to_regprocedure('public.prune_ai_usage()'), 'EXECUTE')
         and not has_function_privilege('authenticated', to_regprocedure('public.prune_ai_usage()'), 'EXECUTE'), false), null
  union all
  select 7, 'קוד אלבום ייחודי לכל אירוע',
    exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.idx_events_album_token') and i.indisunique and i.indisvalid), null
  union all
  select 8, 'כל דף אורח מקבל רק את מה שהוא צריך',
    coalesce((select prosrc ~ 'jsonb_strip_nulls' and prosrc ~ '''invite'', ''gift'', ''rsvp''' and prosrc ~ 'album_token'
       from pg_proc where oid = to_regprocedure('public.public_event_by_token(text,text)')), false), null
  union all
  select 9, 'טבלה משותפת: קבוצות מותאמות',
    coalesce((select prosrc ~ 'custom_groups' from pg_proc where oid = to_regprocedure('public.collab_event_by_token(text)')), false), null
  union all
  select 10, 'כניסה: סימון הגעה נועל את השורה ומבין סימון ישן',
    coalesce((select prosrc ~* 'for update' and prosrc ~ 'legacy_all'
       from pg_proc where oid = to_regprocedure('public.hostess_mark_arrival_by_token(text,text,jsonb,jsonb)')), false), null
  union all
  select 11, 'מתנה: נעילה נגד כפילות',
    coalesce((select prosrc ~ 'pg_advisory_xact_lock' from pg_proc where oid = to_regprocedure('public.submit_gift_by_token(text,text,bigint,text,text)')), false)
    and coalesce((select prosrc ~ 'null::text' and prosrc !~ 'insert into' from pg_proc where oid = to_regprocedure('public.submit_gift_by_token(text,text,bigint,text)')), false), null
  union all
  select 12, 'מתנה: טווח הסכום ₪5 עד ₪100,000, מאומת',
    exists (select 1 from pg_constraint where conrelid = 'public.gifts'::regclass and conname = 'ck_gift_amount_range' and convalidated
             and pg_get_constraintdef(oid) = 'CHECK (((amount >= 500) AND (amount <= 10000000)))'),
    (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.gifts'::regclass and conname = 'ck_gift_amount_range')
  union all
  select 13, 'מתנה: הגנה מכפילות בלחיצה כפולה',
    exists (select 1 from pg_index where indexrelid = to_regclass('public.uq_gifts_event_client_key') and indisunique)
    and to_regclass('public.idx_gifts_event_created') is not null, null
  union all
  select 14, 'דפי האורחים יכולים לפעול',
    (select coalesce(bool_and(coalesce(has_function_privilege('anon', to_regprocedure(f), 'EXECUTE')
                              and has_function_privilege('authenticated', to_regprocedure(f), 'EXECUTE'), false)), false)
       from unnest(array['public.submit_gift_by_token(text,text,bigint,text,text)', 'public.submit_gift_by_token(text,text,bigint,text)',
                         'public.hostess_mark_arrival_by_token(text,text,jsonb,jsonb)', 'public.hostess_mark_arrival_by_token(text,text,jsonb)',
                         'public.public_event_by_token(text,text)', 'public.collab_event_by_token(text)', 'public.album_list_by_token(text)',
                         'public.album_add_photo(text,text,text)',
                         'public.submit_rsvp_by_token(text,text,text,text,integer,text[],text,text)']) f), null
  union all
  select 15, 'כל פונקציה מוגנת קובעת נתיב חיפוש',
    not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
                 and not exists (select 1 from unnest(coalesce(proconfig, '{}')) s where s like 'search_path=%')),
    (select string_agg(oid::regprocedure::text, ', ') from pg_proc where pronamespace = 'public'::regnamespace and prosecdef
       and not exists (select 1 from unnest(coalesce(proconfig, '{}')) s where s like 'search_path=%'))
  union all
  select 17, 'מגבלת קצב: הטבלה קיימת ומוגנת',
    to_regclass('public.guest_write_throttle') is not null
    and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.guest_write_throttle')), false)
    and coalesce(not has_function_privilege('anon', to_regprocedure('public.guest_throttle(text,uuid,integer,integer)'), 'EXECUTE')
             and not has_function_privilege('authenticated', to_regprocedure('public.guest_throttle(text,uuid,integer,integer)'), 'EXECUTE'), false)
    and not has_table_privilege('anon', 'public.guest_write_throttle', 'SELECT'), null
  union all
  select 18, 'מתנה: מגבלת קצב לכל שולח, והנעילה נשארה',
    coalesce((select prosrc ~ 'guest_throttle\(''gift''' and prosrc ~ 'pg_advisory_xact_lock'
       from pg_proc where oid = to_regprocedure('public.submit_gift_by_token(text,text,bigint,text,text)')), false), null
  union all
  select 19, 'אישור הגעה: נעילה ומגבלת קצב',
    coalesce((select prosrc ~ 'guest_throttle\(''rsvp''' and prosrc ~ 'pg_advisory_xact_lock'
       from pg_proc where oid = to_regprocedure('public.submit_rsvp_by_token(text,text,text,text,integer,text[],text,text)')), false), null
  union all
  select 20, 'אלבום: העלאה רק לתיקייה של הקישור הנוכחי, ואין כלל עוקף',
    exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'album_objects_insert'
             and with_check ~ 'album_folder_token_ok' and with_check ~ 'album_token_folder_has_room')
    and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'ALL')
             and coalesce(with_check, qual, '') ~ 'event-album' and policyname <> 'album_objects_insert'),
    (select string_agg(policyname, ', ') from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'ALL') and coalesce(with_check, qual, '') ~ 'event-album')
  union all
  select 21, 'אלבום: נתיב התמונה נבדק (אין בריחה מהתיקייה)',
    coalesce((select prosrc ~ 'token_value \|\| ''/''' and prosrc ~ '%\.\.%' and prosrc ~ '%//%'
       from pg_proc where oid = to_regprocedure('public.album_add_photo(text,text,text)')), false), null
  union all
  select 22, 'אתר האירוע: מגבלת כמות העלאות, ואין כלל עוקף',
    exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'event_site_objects_insert'
             and with_check ~ 'site_folder_has_room')
    and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'ALL')
             and coalesce(with_check, qual, '') ~ 'event-site' and policyname <> 'event_site_objects_insert'), null
  union all
  select 23, 'מחיקת תמונות: תאריך לא תקין לא מפיל את הסריקה',
    to_regprocedure('public.safe_iso_date(text)') is not null
    and coalesce((select prosrc ~ 'safe_iso_date' from pg_proc where oid = to_regprocedure('public.photo_purge_due(integer)')), false)
    and coalesce(not has_function_privilege('anon', to_regprocedure('public.photo_purge_due(integer)'), 'EXECUTE'), false), null
  union all
  select 24, 'טבלה משותפת: טלפון עד 40 תווים',
    exists (select 1 from pg_constraint where conrelid = 'public.collab_guests'::regclass and conname = 'ck_collab_phone_len' and convalidated
             and pg_get_constraintdef(oid) ~ '<= 40')
    and not exists (select 1 from pg_constraint where conrelid = 'public.collab_guests'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ~* 'phone' and conname <> 'ck_collab_phone_len')
    and coalesce((select prosrc ~* 'left\([^;]*phone[^;]*40\)' from pg_proc where oid = to_regprocedure('public.collab_upsert_by_token(text,jsonb)')), false),
    (select string_agg(conname || ': ' || pg_get_constraintdef(oid), '; ') from pg_constraint
      where conrelid = 'public.collab_guests'::regclass and contype = 'c' and pg_get_constraintdef(oid) ~* 'phone')
  union all
  select 25, 'אירועים: מספר הגרסה רק עולה',
    exists (select 1 from pg_trigger where tgrelid = 'public.events'::regclass and tgname = 'trg_events_version_monotone'
             and tgenabled = 'O' and not tgisinternal), null
  union all
  select 26, 'מגבלת קצב: תקרה לכל אירוע, כתובות IPv6, ניקוי רשומות ישנות',
    coalesce((select prosrc ~ 'set_masklen' and prosrc ~ 'pg_advisory_xact_lock'
              and prosrc ~ 'where at < now\(\) - interval ''1 minute'';'
       from pg_proc where oid = to_regprocedure('public.guest_throttle(text,uuid,integer,integer)')), false), null
  union all
  select 27, 'אחסון: אין כלל כתיבה פתוח לאורחים מלבד המוכרים',
    not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and cmd in ('INSERT', 'UPDATE', 'ALL') and roles && array['anon', 'public']::name[]
                 and policyname not in ('album_objects_insert', 'event_site_objects_insert', 'event_site_objects_update')),
    (select string_agg(policyname || ' (' || cmd || ')', ', ') from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'ALL') and roles && array['anon', 'public']::name[]
      and policyname not in ('album_objects_insert', 'event_site_objects_insert', 'event_site_objects_update'))
  union all
  select 28, 'אין כלל קריאה פתוח לאורחים על הטבלאות הרגישות',
    not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename in ('events', 'gifts', 'rsvp_responses', 'album_photos', 'collab_guests')
                 and cmd in ('SELECT', 'ALL') and roles && array['anon', 'public']::name[]
                 and coalesce(qual, 'true') !~ '(auth\.uid\(\)|is_admin)'),
    (select string_agg(tablename || '.' || policyname, ', ') from pg_policies where schemaname = 'public'
      and tablename in ('events', 'gifts', 'rsvp_responses', 'album_photos', 'collab_guests')
      and cmd in ('SELECT', 'ALL') and roles && array['anon', 'public']::name[]
      and coalesce(qual, 'true') !~ '(auth\.uid\(\)|is_admin)')
  union all
  select 29, 'אתר האירוע: בדיקת המקום לא זמינה לאורחים',
    coalesce(not has_function_privilege('anon', to_regprocedure('public.site_folder_has_room(text)'), 'EXECUTE'), false), null
  union all
  select 16, 'ספירת שורות — להשוות לשורה 10 בבדיקה המקדימה (מותר רק לגדול)', null::boolean,
    'אירועים=' || (select count(*) from public.events) || ' מתנות=' || (select count(*) from public.gifts) ||
    ' תמונות=' || (select count(*) from public.album_photos) || ' מנויים=' || (select count(*) from public.subscriptions) ||
    ' אישורי_הגעה=' || (select count(*) from public.rsvp_responses) || ' טבלה_משותפת=' || (select count(*) from public.collab_guests) ||
    ' הגשות_אורחים=' || (select count(*) from public.guest_submissions) || ' משתמשים=' || (select count(*) from public.profiles)
)
select n as "מס", check_name as "בדיקה", ok as "תקין", detail as "פירוט" from c
union all
select 99, 'כל הבדיקות עברו', bool_and(coalesce(ok, true)), null from c
order by 1;
