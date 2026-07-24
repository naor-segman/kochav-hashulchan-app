# מיילים ממותגים — כוכב השולחן

מדריך להפעלת מיילים בעברית ממותגים (במקום המייל הגנרי באנגלית מ־"Supabase Auth").
כל הפעולות הן ב־**דשבורד Supabase** של הפרויקט — לא בקוד. הקוד כבר תומך (יש מסך
`/reset-password` ו־`redirectTo` תקין).

---

## 1. שולח מותאם (SMTP) — הכי חשוב

בלי זה, השולח נשאר `Supabase Auth <noreply@mail.app.supabase.io>` והמיילים מוגבלים בקצב.

**Authentication → Emails → SMTP Settings → Enable Custom SMTP**, ומלאו:

| שדה | מה למלא |
|---|---|
| Sender email | כתובת מהדומיין שלכם, למשל `noreply@kochav-hashulchan.co.il` |
| Sender name | **כוכב השולחן** |
| Host / Port / User / Pass | פרטי ספק ה־SMTP (Resend / Postmark / Brevo / SendGrid / Gmail Workspace…) |

> ספק מומלץ ופשוט: **Resend** (יש free tier). דורש אימות דומיין (SPF/DKIM) כדי
> שהמיילים לא ייכנסו לספאם.

---

## 2. תבניות המייל (עברית + מיתוג)

**Authentication → Emails → Templates.** לכל תבנית — עדכנו את ה־Subject והדביקו את
ה־HTML מהקובץ המתאים בתיקייה זו:

| תבנית ב־Supabase | Subject | קובץ HTML |
|---|---|---|
| **Confirm signup** | `אישור כתובת האימייל — כוכב השולחן` | `confirm-signup.html` |
| **Reset password** | `איפוס סיסמה — כוכב השולחן` | `reset-password.html` |

> אפשר לעצב באותו סגנון גם את *Magic Link* / *Change email* / *Invite* אם תשתמשו
> בהם בעתיד — אותו header/footer, רק להחליף את הטקסט.

התבניות משתמשות במשתנה `{{ .ConfirmationURL }}` בלבד (Supabase מזריק לתוכו את
הקישור הנכון לכל סוג מייל).

---

## 3. כתובות Redirect מורשות

**Authentication → URL Configuration:**

- **Site URL:** כתובת הפרודקשן, למשל `https://kochav-hashulchan.co.il`
- **Redirect URLs (allow list):** הוסיפו את שתי אלה (וגם וריאנט localhost לפיתוח):
  ```
  https://<הדומיין-שלכם>/auth/callback
  https://<הדומיין-שלכם>/reset-password
  http://localhost:5173/auth/callback
  http://localhost:5173/reset-password
  ```

בלי הכתובות האלה ב־allow list, לינק האיפוס/האישור ייחסם או יופנה ל־Site URL.

---

## 4. בדיקה

1. במסך הכניסה → "שכחתם סיסמה?" → הזינו אימייל.
2. המייל אמור להגיע **בעברית, מהשולח "כוכב השולחן"**, עם כפתור "בחירת סיסמה חדשה".
3. הכפתור מוביל ל־`/reset-password` → בוחרים סיסמה → מועברים לאפליקציה.

אם המייל עדיין באנגלית/גנרי → SMTP לא הופעל (שלב 1) או שהתבניות לא נשמרו (שלב 2).
