-- בדיקה מקדימה למיגרציה 20261004000000_abuse_caps — קריאה בלבד, לא משנה כלום.
-- להריץ לפני המיגרציה. מראה את המצב האמיתי בייצור מול התקרות החדשות.
-- בשורות 1–3 "בפועל" צריך להיות רחוק מתחת ל"תקרה". שורות 4–6 צריכות להראות 0:
-- שורה שאינה 0 איננה חוסמת (שורות קיימות לא נפגעות), אבל אומרת שהתקרה נמוכה מהמציאות — לעצור ולשאול.
select 1 as "מס", 'הכי הרבה אירועים בחשבון אחד' as "בדיקה",
  coalesce(max(n), 0)::text as "בפועל", '500' as "תקרה"
  from (select count(*) n from public.events group by user_id) t
union all
select 2, 'האירוע הגדול ביותר (בייטים של טקסט)',
  coalesce(max(octet_length(payload::text)), 0)::text, '8000000'
  from public.events
union all
select 3, 'החשבון הגדול ביותר (בייטים מאוחסנים)',
  coalesce(max(s), 0)::text, '100000000'
  from (select sum(pg_column_size(payload)) s from public.events group by user_id) t
union all
select 4, 'חשבונות שכבר מעל 500 אירועים',
  count(*)::text, '0'
  from (select 1 from public.events group by user_id having count(*) > 500) t
union all
select 5, 'אירועים שכבר מעל 8MB',
  count(*)::text, '0'
  from public.events where octet_length(payload::text) > 8000000
union all
select 6, 'חשבונות שכבר מעל 100MB',
  count(*)::text, '0'
  from (select 1 from public.events group by user_id having sum(pg_column_size(payload)) > 100000000) t
union all
select 7, 'קריאות AI ב-24 השעות האחרונות (כל החשבונות)',
  count(*)::text, '300'
  from public.ai_usage where created_at > now() - interval '1 day'
union all
select 8, 'הכי הרבה קריאות AI ביום אחד, 7 ימים אחרונים',
  coalesce(max(n), 0)::text, '300'
  from (select count(*) n from public.ai_usage
         where created_at > now() - interval '7 days' group by created_at::date) t
order by 1;
