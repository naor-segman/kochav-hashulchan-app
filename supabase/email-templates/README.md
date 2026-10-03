# מיילים ממותגים — Unica Plan

מדריך להפעלת מיילים בעברית ממותגים (במקום המייל הגנרי באנגלית מ־"Supabase Auth").
כל הפעולות הן ב־**דשבורד Supabase** של הפרויקט — לא בקוד. הקוד כבר תומך (יש מסך
`/reset-password` ו־`redirectTo` תקין).

---

## 1. שולח מותאם (SMTP) — הכי חשוב

בלי זה, השולח נשאר `Supabase Auth <noreply@mail.app.supabase.io>` והמיילים מוגבלים בקצב.

**Authentication → Emails → SMTP Settings → Enable Custom SMTP**, ומלאו:

| שדה | מה למלא |
|---|---|
| Sender email | `plan@unica-events.co.il` |
| Sender name | **Unica Plan** |
| Host | `mail.myinbox.co.il` |
| Port | `587` |
| Username | `plan@unica-events.co.il` |
| Password | סיסמת התיבה (אצל הבעלים בלבד) |
| Minimum interval per user | `60` (ברירת המחדל) |

> **פעיל מ-3.10** — התיבה אצל MyNames/MyInbox, נבדק במייל אמיתי. תשובות למייל
> מגיעות ל-`plan@`.

---

## 2. תבניות המייל (עברית + מיתוג)

**Authentication → Emails → Templates.** לכל תבנית — עדכנו את ה־Subject והדביקו את
ה־HTML מהקובץ המתאים בתיקייה זו:

| תבנית ב־Supabase | Subject | קובץ HTML |
|---|---|---|
| **Confirm signup** | `אישור כתובת האימייל — Unica Plan` | `confirm-signup.html` |
| **Reset password** | `איפוס סיסמה — Unica Plan` | `reset-password.html` |

> אפשר לעצב באותו סגנון גם את *Magic Link* / *Change email* / *Invite* אם תשתמשו
> בהם בעתיד — אותו header/footer, רק להחליף את הטקסט.

התבניות **לא** משתמשות ב-`{{ .ConfirmationURL }}` (131, 3.10). זה קישור חד-פעמי
שנשרף בפתיחה הראשונה — וסורקי מייל (Outlook ואחרים) פותחים כל קישור לפני
שהאדם לוחץ, כך שהוא הגיע ל"הקישור אינו תקף". במקומו:
`{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery` ו-
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email` — הדף שלנו
מאמת את הקוד רק בלחיצה של האדם. לכן **Site URL חייב להיות כתובת האתר**.

---

## 3. כתובות Redirect מורשות

**Authentication → URL Configuration:**

- **Site URL:** `https://plan.unica-events.co.il` (בלי `/` בסוף — התבניות מוסיפות אותו)
- **Redirect URLs (allow list):** הוסיפו את שתי אלה (וגם וריאנט localhost לפיתוח):
  ```
  https://plan.unica-events.co.il/**
  http://localhost:5173/auth/callback
  http://localhost:5173/reset-password
  ```

בלי הכתובות האלה ב־allow list, "שלחו לי קישור חדש" מתוך האתר עלול להיות מופנה ל־Site URL במקום לדף האיפוס.

---

## 4. בדיקה

1. במסך הכניסה → "שכחתם סיסמה?" → הזינו אימייל.
2. המייל אמור להגיע **בעברית, מהשולח "Unica Plan"**, עם כפתור "בחירת סיסמה חדשה".
3. הכפתור מוביל ל־`/reset-password` → בוחרים סיסמה → מועברים לאפליקציה.

אם המייל עדיין באנגלית/גנרי → SMTP לא הופעל (שלב 1) או שהתבניות לא נשמרו (שלב 2).
