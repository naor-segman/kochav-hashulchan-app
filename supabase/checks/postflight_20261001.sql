-- בדיקת סיום למיגרציה 20261001000000_review_seven_hardening.
-- להריץ אחרי המיגרציה. כל השורות צריכות להיות "תקין".
select 1 as "מס", 'כל פונקציות ה-SECURITY DEFINER עם pg_temp' as "בדיקה",
  case when count(*) = 0 then 'תקין' else 'חסר' end as "מצב", count(*) as "נמצאו"
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prosecdef
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%pg_temp%')
union all
select 2, 'הפונקציה safe_bool קיימת',
  case when count(*) = 1 then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'safe_bool'
union all
select 3, 'claim_ai_call נועלת לפני הספירה',
  case when bool_or(prosrc like '%pg_advisory_xact_lock%') then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'claim_ai_call'
union all
select 4, 'תקרת המשוב הגלובלית רק לאנונימיים',
  case when bool_or(prosrc like '%user_id IS NULL AND created_at%') then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'submit_feedback'
union all
select 5, 'תיקון מתנה באותו מפתח מעדכן',
  case when bool_or(prosrc like '%update public.gifts g%') then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'submit_gift_by_token'
union all
select 6, 'קישור האלבום רק מיום האירוע ובאתר שפורסם',
  case when bool_or(prosrc like '%safe_iso_date(e.date) <=%') then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'public_event_by_token'
union all
select 7, 'סימון בקישור הדיילת רושם מי סימן',
  case when bool_or(prosrc like '%arrivedBy%') then 'תקין' else 'חסר' end, count(*)
  from pg_proc where proname = 'hostess_mark_arrival_by_token'
order by 1;
