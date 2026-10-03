import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";
import SectionMark from "../components/ui/SectionMark.jsx";
import Footer from "../components/layout/Footer.jsx";
import { useHashScroll } from "../hooks/useHashScroll.js";
import { openConsentSettings } from "../utils/consent.js";
import { analyticsConfigured } from "../lib/analytics.js";
import { COMPANY, supportEmail, supportMailto, LEGAL, LEGAL_DOCS, legalTel } from "../data/company.js";

/* Rewritten 1.10 (checklist 103) from a code-verified inventory of every place
 * personal data goes: the tables and buckets, the five processors the browser
 * and the server functions actually call, the localStorage keys, and what each
 * public link returns from `public_event_by_token`. Written to the duty to
 * inform in §11 of the Privacy Protection Law as amended (Amendment 13, in
 * force 14.8.2025): what is collected, why, whether it is required, who it
 * goes to, and how to use the rights. Guests get their own section, because
 * they give their details directly and never see the signup screen.
 *
 * A sentence here is a claim about the code. legalClaims.test.js pins the ones
 * that were false before. */
export default function PrivacyScreen() {
  // Guest forms link to /privacy#guests.
  useHashScroll();
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">✦</span>
          <span className={styles.logoName}>{COMPANY.name}</span>
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <SectionMark name="privacy" size={26} tile />
          <h1 className={styles.title}>מדיניות פרטיות</h1>
        </div>
        <p className={styles.updated}>עודכן לאחרונה: {LEGAL_DOCS.updated}</p>

        {/* Operator identity — checklist 19–20. An empty address prints NO
            ROW rather than a blank. */}
        <section className={styles.identity}>
          <h2 className={styles.identityTitle}>האחראי על המידע ואיש הקשר לפרטיות</h2>
          <dl className={styles.identityList}>
            <dt className={styles.identityKey}>שם</dt>
            <dd className={styles.identityVal}>{LEGAL.name}</dd>
            <dt className={styles.identityKey}>{LEGAL.type}</dt>
            <dd className={styles.identityVal}>{LEGAL.taxId}</dd>
            <dt className={styles.identityKey}>טלפון</dt>
            <dd className={styles.identityVal}>
              <a href={legalTel()}>{LEGAL.phone}</a>
            </dd>
            <dt className={styles.identityKey}>אימייל</dt>
            <dd className={styles.identityVal}>
              <a href={supportMailto()}>{supportEmail()}</a>
            </dd>
            {LEGAL.address && (
              <>
                <dt className={styles.identityKey}>כתובת</dt>
                <dd className={styles.identityVal}>{LEGAL.address}</dd>
              </>
            )}
          </dl>
          <p className={styles.text}>אליו פונים בכל שאלה ובכל בקשה לעיין במידע, לתקן אותו או למחוק אותו.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. בקצרה</h2>
          <ul className={styles.list}>
            <li>אנחנו שומרים את מה שצריך כדי לתכנן ולנהל את האירוע שלכם, ולא יותר.</li>
            <li>לא מוכרים מידע, לא משכירים אותו, ולא משתמשים בפרטי האורחים לפרסום — לא שלנו ולא של אחרים.</li>
            <li>לא משתמשים במידע שלכם או של האורחים כדי לאמן מודלים של בינה מלאכותית.</li>
            <li>אין חובה חוקית למסור לנו מידע. בלי אימייל אי אפשר לפתוח חשבון, ובלי שם אי אפשר לאשר הגעה. כל השאר רשות.</li>
          </ul>
          <p className={styles.text}>
            המדיניות כפופה לחוק הגנת הפרטיות, התשמ״א-1981, על תיקוניו. היא חלה
            על שלוש קבוצות: מארחים שפותחים חשבון, אורחים שמשתמשים בקישור שקיבלו,
            ומבקרים באתר.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. מארחים — מה נשמר</h2>
          <ul className={styles.list}>
            <li><strong>חשבון</strong> — אימייל וסיסמה. הסיסמה שמורה אצל ספק ההתחברות כגיבוב חד-כיווני, ואיננו יכולים לראות אותה. נשמר גם מתי ולאיזו גרסה של התנאים הסכמתם בהרשמה.</li>
            <li><strong>האירוע</strong> — שם, סוג, תאריך, מקום, שמות בעלי השמחה, שולחנות, סידור הושבה, אילוצים, אתר האירוע וההזמנה (כולל טלפון ליצירת קשר והסעות, אם הזנתם), תמונות לאתר, תקציב, ספקים, משימות ונוסחי הודעות.</li>
            <li><strong>רשימת האורחים</strong> — מה שאתם מזינים: שמות, טלפונים, מלווים, צד וקבוצה, מספר מקומות, מנה, הערות, מתנה משוערת, תשובות לאישור הגעה, למי נשלחה איזו הודעה, וסימוני הגעה ביום האירוע (כולל השעה).</li>
            <li><strong>סקיצת אולם</strong> — נשמרת רק במכשיר שלכם. אם תבחרו בזיהוי שולחנות אוטומטי, התמונה נשלחת לניתוח (ראו סעיף 6) ולא נשמרת אצלנו.</li>
            <li><strong>רכישות</strong> — המסלול, הסכום, התאריך, האירוע ומזהה הלקוח אצל חברת הסליקה. פרטי כרטיס האשראי נמסרים ישירות לחברת הסליקה, ואיננו רואים אותם.</li>
            <li><strong>זיהוי שולחנות מסקיצה</strong> — מתי השתמשתם בו, כדי להגביל את מספר הפעמים. נמחק אחרי שבוע.</li>
            <li><strong>משוב</strong> — מה שכתבתם, דרך ליצור איתכם קשר אם השארתם, מזהה החשבון, כתובת העמוד בלי קודי הקישורים, וסוג הדפדפן.</li>
            <li><strong>דיווחי תקלות</strong> — כשעמוד קורס, נשלחים אלינו אוטומטית הודעת השגיאה, כתובת העמוד בלי קודי הקישורים, סוג הדפדפן, ומזהה החשבון אם אתם מחוברים. זה קורה גם בדפי האורחים.</li>
            <li><strong>מדידת שימוש</strong> — רק אם אישרתם אותה (סעיף 7): אילו עמודים ופעולות עיקריות נעשו (למשל "נוצר אירוע", "הורצה הושבה"), עם מזהה חשבון בלבד, בלי אימייל, בלי שמות אורחים ובלי קודי הקישורים.</li>
          </ul>
          <p className={styles.text}>
            בלי חשבון (מצב אורח) האירועים נשמרים רק בדפדפן שלכם. אלינו מגיעים
            רק דיווחי התקלות, ומדידת השימוש אם אישרתם אותה.
          </p>
        </section>

        <section className={styles.section} id="guests">
          <h2 className={styles.sectionTitle}>3. אורחים — מה נשמר</h2>
          <p className={styles.text}>
            אם הגעתם לכאן מקישור שקיבלתם ממארחים: את הקישור יצרו המארחים, והם
            מחליטים את מי להזמין ומה לשאול. אנחנו שומרים את מה שאתם ממלאים כדי
            להעביר אותו למארחים. מסירת הפרטים רשות, אבל בלי שם אי אפשר לאשר הגעה
            או להשאיר ברכה.
          </p>
          <ul className={styles.list}>
            <li><strong>אישור הגעה</strong> — שם, טלפון (לא חובה), האם מגיעים, כמה, שמות המלווים, מנה והסעה, לפי מה שהמארחים ביקשו.</li>
            <li><strong>דף המתנה והברכה</strong> — שם, הסכום שאתם מצהירים עליו (לפחות 50 ₪), וברכה אם כתבתם. הסכום מוצג רק למארחים. השם והברכה מופיעים גם בקיר הברכות, אלא אם המארחים הסתירו אותם.</li>
            <li><strong>אלבום משותף</strong> — התמונות שהעליתם והשם שכתבתם. כל מי שמחזיק בקישור לאלבום או לאתר האירוע רואה אותן.</li>
            <li><strong>טבלה שיתופית</strong> — השורות שהוספתם או ערכתם, והשם שכתבתם כעורכים.</li>
            <li><strong>עמדת הכניסה (קישור לדיילת)</strong> — סימוני ההגעה שסימנתם.</li>
          </ul>
          <p className={styles.text}>
            כדי למנוע הצפה של טופס אישור ההגעה ודף המתנה נשמר ערך מגובב (hash)
            של כתובת הרשת שלכם, והוא נמחק בדרך כלל תוך דקות. בדפי האורחים פועלים
            גם דיווחי תקלות, כמתואר בסעיף 2. שאלת העוגיות לא מוצגת בהם ומדידת
            שימוש לא פועלת בהם — גם לא אם עוברים משם לאתר שלנו ומאשרים שם — אלא
            בדפדפן שכבר אישר אותה קודם (למשל מארחים שבודקים את הקישור). אז
            נמדדים צפייה בדף, התשובה לאישור ההגעה, וטווח סכום המתנה והאם צורפה
            ברכה — לא הסכום, לא השם, לא תוכן הברכה ולא הטלפון.
          </p>
          <p className={styles.text}>
            רוצים לעיין במה שמסרתם, לתקן אותו או למחוק אותו? פנו אלינו — נטפל
            בבקשה בעצמנו בתוך 30 יום ונעדכן את המארחים.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. למה אנחנו משתמשים במידע</h2>
          <ul className={styles.list}>
            <li>לתת את השירות: לשמור את האירוע, לסנכרן אותו בין מכשירים ולהציג את הדפים לאורחים.</li>
            <li>לנהל את החשבון, לקבל תשלום ולהוציא קבלה.</li>
            <li>לענות לפניות ולתקן תקלות.</li>
            <li>לאבטח את השירות ולמנוע ניצול לרעה.</li>
            <li>להבין, בצורה מצטברת, אילו חלקים בשירות עוזרים ואילו לא — כדי לשפר אותו.</li>
            <li>לעמוד בחובות לפי דין, למשל שמירת רישומי תשלום.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. מי רואה מה</h2>
          <ul className={styles.list}>
            <li><strong>אתם</strong> — כל מה שבחשבון שלכם, מכל מכשיר שמחובר אליו.</li>
            <li><strong>מי שמחזיק קישור</strong> — מה שאותו קישור מציג, וגם הדפים שהוא מקשר אליהם (פירוט בהמשך). קישור הוא כמו מפתח: מי שקיבל אותו יכול להעביר אותו הלאה.</li>
            <li><strong>אנחנו</strong> — מפעיל השירות ניגש לנתוני אירוע רק לצורך תמיכה, תיקון תקלה או אבטחה.</li>
            <li><strong>ספקים</strong> — שמפעילים בשבילנו את התשתית (סעיף 6).</li>
            <li><strong>רשויות</strong> — רק כשהחוק מחייב, למשל לפי צו של בית משפט.</li>
          </ul>
          <p className={styles.text}>מה כל קישור מציג:</p>
          <ul className={styles.list}>
            <li><strong>אישור הגעה</strong> — שם האירוע, התאריך, המקום ושמות בעלי השמחה, לוח הזמנים וההסעות (כולל שם וטלפון של איש הקשר להסעה, אם הזנתם), ותמונת השער אם האתר פורסם. ממנו אפשר להגיע גם לאתר האירוע (אם פורסם) ולדף המתנה.</li>
            <li><strong>אתר האירוע, הזמנה, "שמרו את התאריך" וכרטיס אישי</strong> — כל מה שפרסמתם באתר, כולל טלפון ליצירת קשר אם הזנתם, והברכות שבקיר (שם וברכה, בלי סכומים). מהם אפשר להגיע גם לאישור ההגעה, לדף המתנה ולאלבום — כולל צפייה בתמונות והעלאה. בכרטיס האישי מופיעים בקישור עצמו שם האורח ומספר השולחן שלו.</li>
            <li><strong>דף המתנה וקיר הברכות</strong> — פרטי האירוע, ובקיר: שמות וברכות שלא הוסתרו, בלי סכומים.</li>
            <li><strong>אלבום</strong> — התמונות שלא הוסתרו ושמות מי שהעלה. הסתרה מורידה תמונה מהאלבום, אבל מי שכבר שמר את הכתובת הישירה שלה עדיין יכול לפתוח אותה. רק מחיקה מסירה את הקובץ, ועותק שמישהו כבר הוריד נשאר אצלו.</li>
            <li><strong>עמדת הכניסה (קישור לדיילת)</strong> — שמות האורחים, מספר המקומות, המלווים, תשובת אישור ההגעה, השולחן וסימוני ההגעה. בלי טלפונים.</li>
            <li><strong>טבלה שיתופית</strong> — כל השורות שבה, כולל טלפונים והערות, עם אפשרות לערוך. שלחו את הקישור הזה רק למי שעורך איתכם את הרשימה.</li>
          </ul>
          <p className={styles.text}>
            את הקישור לטבלה השיתופית אפשר לסגור או להחליף בכל רגע מתוך האפליקציה.
            את הקישור לדיילת אפשר להחליף, וההחלפה מבטלת את הישן; סגירת הסימון
            רק עוצרת את סימוני ההגעה, והרשימה עדיין מוצגת. כשמשתפים קישור
            בוואטסאפ, התצוגה המקדימה מציגה את שם האירוע, שמות בעלי השמחה, התאריך
            והמקום.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. ספקים ומידע שעובר לחו״ל</h2>
          <p className={styles.text}>
            השירות פועל על גבי ספקים שהשרתים שלהם נמצאים מחוץ לישראל — באיחוד
            האירופי ובארצות הברית — ולכן המידע נשמר ומעובד שם. כל ספק מקבל רק את
            מה שנדרש לשירות שהוא נותן, ופועל לפי תנאי השירות ומדיניות הפרטיות
            שלו. כמו בכל אתר, ספקי התשתית רושמים ביומני השרת את כתובת הרשת, סוג
            הדפדפן והכתובת שנפתחה, ושומרים אותם לתקופה קצרה לפי המדיניות שלהם.
          </p>
          <ul className={styles.list}>
            <li><strong>Supabase</strong> — מסד הנתונים, ההתחברות, אחסון התמונות ושליחת מיילי ההרשמה ואיפוס הסיסמה. כאן נשמרים האירועים ורשימות האורחים.</li>
            <li><strong>Netlify</strong> — אחסון האתר והגשתו לדפדפן.</li>
            <li><strong>Google Fonts</strong> — הגופנים באתר. הדפדפן שלכם פונה לגוגל כדי לטעון אותם, ולכן גוגל מקבלת את כתובת הרשת שלכם.</li>
            <li><strong>Google Analytics</strong> — מדידת שימוש, רק אם אישרתם אותה. מקבלת מזהה חשבון (או מזהה אקראי), את העמוד בלי קודי הקישורים, פרטים כלליים על הדפדפן והמכשיר, וכתובת הרשת, שממנה Google מסיקה אזור משוער — לא אימייל, לא שמות אורחים ולא הקלטות מסך. המידע עשוי להישמר בשרתי Google גם מחוץ לישראל, כולל בארה״ב. שיתוף לצורכי פרסום ו-Google Signals כבויים.</li>
            <li><strong>Anthropic</strong> — ניתוח תמונת סקיצה של האולם לזיהוי שולחנות, רק כשאתם בוחרים בכך. נשלחת התמונה בלבד; Anthropic עשויה לשמור אותה לזמן מוגבל לפי התנאים שלה, ולא משתמשת בה לאימון מודלים.</li>
            <li><strong>חברת הסליקה (כיום Stripe)</strong> — סליקת התשלום ברכישה. מקבלת את האימייל שלכם, את פרטי הכרטיס שאתם מזינים אצלה ואת פרטי הרכישה.</li>
            <li><strong>וואטסאפ (Meta)</strong> — כשאתם פונים אלינו בכפתור התמיכה, השיחה מתנהלת בוואטסאפ. כשמשתפים קישור לאירוע בוואטסאפ, Meta קוראת את התצוגה המקדימה שלו.</li>
          </ul>
          <p className={styles.text}>
            לחיצה על קישור חיצוני — וואטסאפ, Waze — מעבירה אתכם לשירות של אותה
            חברה, והמדיניות שלה חלה שם.
          </p>
        </section>

        <section className={styles.section} id="device">
          <h2 className={styles.sectionTitle}>7. מה נשמר במכשיר שלכם (עוגיות)</h2>
          <p className={styles.text}>
            אין עוגיות פרסום ואין מעקב בין אתרים. מה שהאתר שומר בדפדפן נשמר
            באחסון המקומי שלו, ומתחלק לשניים.
          </p>
          <p className={styles.text}>
            <strong>חיוני — פועל תמיד</strong>, כי זה חלק מפעולת האתר, ולא נשלח
            לאף אחד אחר:
          </p>
          <ul className={styles.list}>
            <li>החיבור לחשבון, כדי שלא תצטרכו להתחבר בכל כניסה.</li>
            <li>עותק של האירועים שלכם, כדי שהאפליקציה תעבוד גם כשאין רשת.</li>
            <li>שמות שהקלדתם באלבום או בטבלה השיתופית, כדי שלא תצטרכו להקליד שוב.</li>
            <li>בעמדת הכניסה (גם בקישור לדיילת) — עותק של רשימת האורחים עד שהלשונית נסגרת, כדי שסימוני ההגעה יעבדו גם בלי רשת.</li>
            <li>מה שכבר ראיתם, אישרתם או דחיתם (למשל הסיור המודרך), כדי שלא תישאלו שוב.</li>
            <li>סימונים טכניים — מה כבר נשלח ומה עוד ממתין לסנכרון — כדי שדבר לא יישלח פעמיים או ילך לאיבוד.</li>
            <li>התשובה שלכם לשאלת העוגיות ומתי נתתם אותה.</li>
            <li>קבצי האתר, ולזמן קצר גם תשובות מהשרת, כדי שהאתר ייטען מהר ויעבוד בלי רשת.</li>
          </ul>
          <p className={styles.text}>
            <strong>מדידת שימוש — רק אם אישרתם:</strong> עוגייה של Google Analytics
            עם מזהה אקראי, לעד 13 חודשים (סעיף 6), בלי פרסום. בכניסה הראשונה אנחנו שואלים;
            עד שעונים — וגם אם מסרבים — היא לא פועלת: לא נשלח אליה דבר ולא נשמר
            מזהה. אם תחזרו בכם מהאישור, המדידה נעצרת והעוגייה נמחקת מהדפדפן.
          </p>
          {analyticsConfigured && (
            <p className={styles.text}>
              <button type="button" className={styles.inlineButton} onClick={openConsentSettings}>
                לשינוי הבחירה — הגדרות עוגיות
              </button>
            </p>
          )}
          <p className={styles.text}>
            בהתנתקות נמחקים מהמכשיר העותקים של אירועים שכבר מסונכרנים לענן. במסך
            החשבון יש כפתור שמוחק מהמכשיר גם את השאר, ואפשר תמיד לנקות את נתוני
            האתר בהגדרות הדפדפן.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. כמה זמן המידע נשמר</h2>
          <ul className={styles.list}>
            <li><strong>חשבון ואירועים</strong> — עד שתמחקו אותם.</li>
            <li><strong>תמונות אתר האירוע</strong> (שער, גלריה ותמונת ההזמנה) — נמחקות אוטומטית 30 יום אחרי האירוע. שבוע לפני כן מופיעה התראה באפליקציה, ואפשר לדחות את המחיקה ב-30 יום נוספים.</li>
            <li><strong>תמונות האלבום המשותף</strong> — לא נמחקות אחרי 30 יום. הן נשמרות עד שהמארחים מוחקים אותן או את האירוע.</li>
            <li><strong>מה שאורחים מסרו</strong> (אישורי הגעה, ברכות, אלבום, טבלה שיתופית) — נמחק יחד עם האירוע, כולל קבצי התמונות.</li>
            <li><strong>רישומי תשלום</strong> — לתקופה שדיני המס מחייבים, אצל חברת הסליקה ובהנהלת החשבונות שלנו.</li>
            <li><strong>משוב ודיווחי תקלות</strong> — נמחקים ידנית מעת לעת, כשאינם נחוצים עוד לטיפול בפנייה או בתקלה. אפשר לבקש למחוק אותם.</li>
            <li><strong>גיבויים</strong> — מסד הנתונים מגובה כל יום אצל ספק התשתית, והגיבויים נשמרים עד שבעה ימים. לכן מידע שנמחק יכול להישאר בגיבוי עד שבוע. קבצי התמונות אינם חלק מהגיבוי.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. אבטחה</h2>
          <p className={styles.text}>
            התקשורת מוצפנת (HTTPS). מסד הנתונים מגביל כל חשבון לנתונים שלו, וכל דף אורח
            מקבל מהשרת רק את מה שהוא צריך. הקישורים מבוססים על קודים אקראיים
            ארוכים שלא סביר לנחש, והטפסים הציבוריים מוגבלים בכמות. אף מערכת אינה
            חסינה לחלוטין. אם תגלו בעיית אבטחה, ספרו לנו. אם יקרה אירוע אבטחה
            חמור, נדווח לרשות להגנת הפרטיות כנדרש, ונודיע לכם כשהרשות תורה על כך
            או כשזה נחוץ כדי שתוכלו להגן על עצמכם.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. הזכויות שלכם</h2>
          <ul className={styles.list}>
            <li><strong>לעיין</strong> במידע שלכם — רובו מוצג באפליקציה, ואת השאר נמסור לפי בקשה.</li>
            <li><strong>לתקן</strong> מידע שגוי — בעצמכם באפליקציה, או בפנייה אלינו.</li>
            <li><strong>למחוק</strong> — אירוע מוחקים מתוך האפליקציה. למחיקת החשבון כולו פנו אלינו (במסך החשבון יש קישור מוכן לכך), ואנחנו נמחק אותו בתוך 30 יום, חוץ ממה שהחוק מחייב לשמור.</li>
            <li><strong>להתנגד לדיוור</strong> — איננו שולחים דיוור שיווקי. אם נתחיל, זה יהיה רק למי שהסכים לכך מראש, ובכל הודעה תהיה דרך להסיר את עצמכם.</li>
          </ul>
          <p className={styles.text}>
            נענה לכל בקשה בתוך 30 יום. אם לא קיבלתם מענה או שאינכם מרוצים ממנו,
            אפשר לפנות לרשות להגנת הפרטיות.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. קטינים</h2>
          <p className={styles.text}>
            פתיחת חשבון מותרת מגיל 18. בין האורחים יכולים להיות גם ילדים — למשל
            בבר מצווה או בבת מצווה — ופרטיהם נמסרים על ידי המארחים או על ידי ההורים.
            לבקשה להסיר תמונה של קטין מהאלבום, פנו אלינו. נטפל בה בתוך שלושה ימי
            עסקים, ונסתיר את התמונה מיד עד שנסיים לבדוק.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. הודעות מאיתנו</h2>
          <p className={styles.text}>
            נשלח אליכם הודעות שירות: אישור הרשמה, איפוס סיסמה, קבלות ועדכונים
            מהותיים על השירות. דיוור שיווקי איננו שולחים; אם נתחיל, רק למי שהסכים
            לכך מראש. לאורחים איננו שולחים שום הודעה — את ההודעות שולחים
            המארחים מהטלפון שלהם.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>13. שינויים במדיניות</h2>
          <p className={styles.text}>
            כשנשנה את המדיניות נעדכן את התאריך בראש העמוד. על שינוי מהותי נודיע
            באימייל או באתר לפחות 14 יום מראש.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>14. יצירת קשר</h2>
          <p className={styles.text}>
            בכל שאלה או בקשה בנושא פרטיות: <a href={supportMailto()}>{supportEmail()}</a>
            {" "}או בטלפון <a href={legalTel()}>{LEGAL.phone}</a>. ראו גם את{" "}
            <Link to="/terms">תנאי השימוש</Link>.
          </p>
        </section>

        <div className={styles.backRow}>
          <Link to="/" className={styles.backLink}>→ חזרה לדף הבית</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
