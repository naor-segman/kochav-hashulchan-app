-- בדיקת סיום למיגרציה 20261004000000_abuse_caps.
-- להריץ אחרי המיגרציה. כל השורות צריכות להיות "תקין".
select 1 as "מס", 'הטריגר שמגביל אירועים קיים ופעיל' as "בדיקה",
  case when count(*) = 1 then 'תקין' else 'חסר' end as "מצב", count(*) as "נמצאו"
  from pg_trigger
 where tgname = 'trg_events_enforce_caps' and tgrelid = 'public.events'::regclass and tgenabled = 'O'
union all
select 2, 'ארבע התקרות קיימות בהגדרות',
  case when count(*) = 4 then 'תקין' else 'חסר' end, count(*)
  from information_schema.columns
 where table_schema = 'public' and table_name = 'app_settings'
   and column_name in ('max_events_per_user', 'max_event_payload_bytes', 'max_user_payload_bytes', 'ai_daily_global_cap')
union all
select 3, 'הפונקציה usage_caps קיימת',
  case when count(*) = 1 then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'usage_caps' and pronamespace = 'public'::regnamespace
union all
select 4, 'claim_ai_call אוכפת תקרה יומית כללית',
  case when bool_or(prosrc like '%ai:global%' and prosrc like '%usage_caps%') then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'claim_ai_call'
union all
select 5, 'claim_ai_call עדיין נועלת לכל משתמש',
  case when bool_or(prosrc like '%''ai:'' || uid::text%') then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'claim_ai_call'
union all
select 6, 'אינדקס לספירת קריאות AI לפי זמן',
  case when count(*) = 1 then 'תקין' else 'חסר' end, count(*)
  from pg_indexes where schemaname = 'public' and indexname = 'ai_usage_created_at'
union all
select 7, 'כל פונקציות ה-SECURITY DEFINER עם pg_temp',
  case when count(*) = 0 then 'תקין' else 'חסר' end, count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%pg_temp%')
order by 1;
