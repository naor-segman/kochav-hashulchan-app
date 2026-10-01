import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";
import SectionMark from "../components/ui/SectionMark.jsx";
import Footer from "../components/layout/Footer.jsx";
import { COMPANY, LEGAL, LEGAL_DOCS, legalTel, supportEmail, supportMailto } from "../data/company.js";

/* Rewritten 1.10 (checklist 103) against an inventory of what the product
 * actually does, and against the Israeli rules that bind a consumer website:
 * the Consumer Protection Law (disclosure, a 14-day cancellation right — the
 * detail is on /refunds), the Standard Contracts Law (no blanket exclusion of
 * liability, no unilateral change without notice, no forum the customer cannot
 * reach), and the Communications Law on messages. It is a draft for the
 * owner's lawyer, not a substitute for one. */
export default function TermsScreen() {
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
          <SectionMark name="terms" size={26} tile />
          <h1 className={styles.title}>תנאי שימוש</h1>
        </div>
        <p className={styles.updated}>עודכן לאחרונה: {LEGAL_DOCS.updated}</p>

        {/* Operator identity — checklist 19–20. An empty address prints NO
            ROW rather than a blank. */}
        <section className={styles.identity}>
          <h2 className={styles.identityTitle}>מפעיל השירות</h2>
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
          <p className={styles.text}>
            {COMPANY.name} מופעלת כעסק יחיד על ידי {LEGAL.name}. זה הצד שאיתו אתם
            מתקשרים בהסכם הזה, ועל שמו יוצאות הקבלות.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. על מה התנאים האלה</h2>
          <p className={styles.text}>
            {COMPANY.name} היא מערכת מקוונת לתכנון וניהול אירועים: רשימת אורחים,
            סידור הושבה, אישורי הגעה, אתר לאירוע והזמנה דיגיטלית, דף מתנה וברכה,
            אלבום משותף, תכנון תקציב וספקים, וכלים ליום האירוע. התנאים חלים על
            כל שימוש באתר {COMPANY.domain} ובשירות. יחד איתם חלות{" "}
            <Link to="/privacy">מדיניות הפרטיות</Link> ו
            <Link to="/refunds">מדיניות הביטול וההחזרים</Link>.
          </p>
          <ul className={styles.list}>
            <li><strong>מארחים</strong> — מי שפותח חשבון ומנהל בו אירוע.</li>
            <li><strong>אורחים</strong> — מי שמקבל מהמארח קישור לאירוע (אישור הגעה, אתר, הזמנה, דף מתנה וברכה, אלבום, טבלה שיתופית או קישור לדיילת) ומשתמש בו.</li>
            <li>התנאים כתובים בלשון רבים ופונים לכל המגדרים.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. מי יכול לפתוח חשבון</h2>
          <ul className={styles.list}>
            <li>פתיחת חשבון מותרת מגיל 18. מי שפותח חשבון בשם אחר (למשל הורים בשם בני הזוג) מצהיר שיש לו רשות לכך.</li>
            <li>אתם אחראים לשמור את פרטי הכניסה בסוד ולעדכן אותנו אם נחשפו. פעולות בחשבון נחשבות כפעולות שלכם עד שהודעתם לנו שהפרטים נחשפו — אלא אם הן נבעו מכשל אבטחה אצלנו.</li>
            <li>אורחים לא צריכים חשבון. הם משתמשים רק בקישור שקיבלו, והתנאים האלה חלים עליהם ככל שהם נוגעים לשימוש בקישור.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. חינם ובתשלום</h2>
          <ul className={styles.list}>
            <li>ההרשמה והמסלול הבסיסי חינמיים. מה כלול בכל מסלול מפורט ב<Link to="/pricing">דף המחירים</Link>.</li>
            <li>רכישה היא <strong>תשלום חד-פעמי לאירוע אחד</strong>. אין מנוי ואין חיוב חוזר. החבילה נקשרת לאירוע שבחרתם ברכישה, ואינה עוברת לאירוע אחר.</li>
            <li>המחיר שמוצג הוא המחיר הסופי בשקלים. העסק הוא עוסק פטור ואינו גובה מע״מ, ולכן נשלחת קבלה ולא חשבונית מס.</li>
            <li>מחירים יכולים להשתנות לרכישות עתידיות. שינוי מחיר לא חל על אירוע שכבר שילמתם עליו.</li>
            <li>מחיקת אירוע ששולם עליו מבטלת גם את החבילה שלו, ולפני המחיקה מוצגת על כך אזהרה. המחיקה לא פוגעת בזכות לבטל את העסקה לפי <Link to="/refunds">מדיניות הביטול</Link>.</li>
            <li>שירותים שנותן אדם (למשל מנהל הושבה בכניסה ביום האירוע): המועד, השעות וההיקף מתואמים איתכם מראש ובכתב, והם חלק מפרטי העסקה.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. ביטול והחזר</h2>
          <p className={styles.text}>
            אפשר לבטל רכישה בתוך 14 יום, לפי חוק הגנת הצרכן. כל הפרטים — איך
            מבטלים, מה מוחזר ומתי, ומה הדין לגבי שירות שנותן אדם — נמצאים ב
            <Link to="/refunds">מדיניות הביטול וההחזרים</Link>.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. המידע שאתם מעלים, ובעיקר פרטי האורחים</h2>
          <ul className={styles.list}>
            <li>המידע שאתם מזינים — אורחים, טלפונים, הערות, פרטי האירוע, תקציב וספקים — שייך לכם. אנחנו משתמשים בו רק כדי לתת לכם את השירות, כמתואר ב<Link to="/privacy">מדיניות הפרטיות</Link>.</li>
            <li>כשאתם מעלים פרטים של אנשים אחרים, אתם מצהירים שהם הגיעו אליכם כדין ושמותר לכם להשתמש בהם לתכנון האירוע. אל תעלו מידע שאינו נחוץ לאירוע, ובמיוחד לא מידע רגיש (למשל מצב רפואי) בשדות ההערות.</li>
            <li>אתם בוחרים למי לשלוח כל קישור. מי שמחזיק קישור יכול לפתוח אותו ולהעביר אותו הלאה, ולכן כדאי לשתף כל קישור רק עם מי שהוא מיועד לו. מה שכל קישור מציג מפורט במדיניות הפרטיות.</li>
            <li>מומלץ לייצא לאקסל עותק של הרשימה ושל ההושבה לפני האירוע.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. הודעות לאורחים</h2>
          <ul className={styles.list}>
            <li>{COMPANY.name} לא שולחת הודעות בשמכם. היא מכינה נוסח וקישור, ואתם שולחים אותם מהטלפון שלכם (למשל בוואטסאפ). אתם השולחים, ואתם יכולים לערוך כל הודעה לפני השליחה. אם נוסיף שליחה אוטומטית, נעדכן את התנאים לפני כן.</li>
            <li>השליחה צריכה להתאים לדין, ובכלל זה לחוק התקשורת (בזק ושידורים) לעניין הודעות פרסומת. הזמנה אישית לאירוע שלכם אינה פרסומת. אל תשתמשו בשירות כדי לשלוח פרסום לאנשים שלא הסכימו לקבל אותו.</li>
            <li>בסוף ההודעות שהמערכת מנסחת מתווספות שתי שורות שלנו: "נבנה עם {COMPANY.name}" ושאלה עם קישור לאתר שלנו. אפשר למחוק אותן לפני השליחה.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. תוכן שאורחים מעלים — ברכות ותמונות</h2>
          <ul className={styles.list}>
            <li>מי שמעלה ברכה או תמונה מצהיר שהיא שלו או שמותר לו להעלות אותה, ושלא תפגע באף אחד. מי שמצולם בתמונה צריך להסכים להופיע באלבום. קטינים מעלים תוכן באחריות הוריהם.</li>
            <li>הזכויות בתוכן נשארות אצל מי שהעלה אותו. ההעלאה נותנת ל{COMPANY.name} רשות מוגבלת לשמור את התוכן, להציג אותו למארחים ולמי שמחזיק בקישור, ולאפשר למארחים להוריד אותו — רק לצורך השירות ורק כל עוד הוא לא נמחק. הרשות כוללת את ההעתקות הטכניות שהשירות צריך, כמו הקטנת תמונה וגיבוי. לא נשתמש בתוכן הזה לשום מטרה אחרת, וגם לא לפרסום שלנו.</li>
            <li>המארחים יכולים להסתיר ברכות ולהסתיר או למחוק תמונות. בקשה להסיר תוכן פוגעני, תוכן שמפר זכויות, או תמונה של קטין או של מי שלא הסכים — שלחו אלינו לכתובת <a href={supportMailto()}>{supportEmail()}</a> עם הקישור ותיאור התוכן. נבדוק ונטפל בתוך זמן סביר, ובדרך כלל בתוך שלושה ימי עסקים. תוכן שנראה פוגעני במובהק נסתיר מיד, עד סיום הבדיקה.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. ברכות ומתנות — אין כאן העברת כסף</h2>
          <p className={styles.text}>
            בדף המתנה והברכה אורח מצהיר על סכום מתנה ויכול להשאיר ברכה. זו הצהרה בלבד:
            {" "}{COMPANY.name} לא גובה, לא מחזיקה ולא מעבירה כסף, אינה שירות
            תשלומים, ואינה בודקת שהמתנה אכן ניתנה. ההעברה עצמה, אם יש כזו, נעשית
            בין האורח למארחים מחוץ לשירות. הסכומים מוצגים רק למארחים, לא בקיר
            הברכות.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>9. מה אסור</h2>
          <ul className={styles.list}>
            <li>שימוש לפעילות בלתי חוקית, מטעה, פוגענית או מאיימת, או התחזות לאדם אחר.</li>
            <li>העלאת תוכן שמפר זכויות של אחרים, או פרטים של אנשים בלי זכות לעשות בהם שימוש.</li>
            <li>ניסיון לעקוף את ההגבלות של השירות, לגשת למידע של אחרים, להעמיס על המערכת או לשבש אותה, או לאסוף ממנה מידע באופן אוטומטי.</li>
            <li>שימוש בקישורי האורחים לשליחת דואר זבל או פרסום.</li>
          </ul>
          <p className={styles.text}>
            אם יש חשש ממשי לפגיעה באחרים או במערכת, נוכל להשבית קישור או חשבון.
            ככל שאפשר נודיע לכם קודם ונאפשר לתקן. השבתה של אירוע ששולם עליו, שלא
            בגלל הפרה שלכם, מזכה בהחזר.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>10. זמינות ושינויים בשירות</h2>
          <ul className={styles.list}>
            <li>אנחנו עושים מאמץ שהשירות יהיה זמין ותקין, אבל מערכת מקוונת נשענת גם על ספקים, על חיבור לרשת ועל המכשיר שלכם, ולכן ייתכנו תקלות והפסקות.</li>
            <li>השירות מתפתח, והיכולות שבו עשויות להשתנות. באירוע ששילמתם עליו לא נוריד יכולת שהייתה חלק מהחבילה לפני מועד האירוע, ולכל היותר במשך 12 חודשים מהרכישה.</li>
            <li>אם נחליט להפסיק את השירות, נודיע מראש באימייל ובאתר, נאפשר לייצא את הנתונים, ונחזיר את התשלום על אירועים שעוד לא התקיימו.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>11. אחריות</h2>
          <ul className={styles.list}>
            <li>הסידור האוטומטי וההמלצות (הושבה, מנות, תקציב, זיהוי שולחנות מסקיצה) הם הצעה. ההחלטה הסופית ובדיקת הסידור לפני האירוע הן שלכם.</li>
            <li>איננו אחראים למעשים או למחדלים של אורחים ושל ספקי האירוע שבחרתם (אולם, קייטרינג וכדומה), ולא לתקלות בשירותים שאינם בשליטתנו, כמו וואטסאפ או רשת הסלולר. לספקי התשתית שאנחנו בחרנו (ראו סעיף 6 ב<Link to="/privacy">מדיניות הפרטיות</Link>) אנחנו אחראים כלפיכם כמו לעצמנו.</li>
            <li>ככל שהדין מתיר, האחריות שלנו לנזק שנגרם בגלל הפרה שלנו מוגבלת לסכום ששילמתם עבור האירוע שבו נגרם הנזק, ובמסלול החינמי — ל-500 ₪.</li>
            <li>ההגבלה הזו לא חלה על נזק שנגרם בזדון או ברשלנות חמורה שלנו, ולא במקרה שהדין אוסר להגביל אחריות.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>12. קניין רוחני</h2>
          <p className={styles.text}>
            הזכויות בשירות, בעיצובו, בטקסטים ובקוד שלו שמורות ל{LEGAL.name}.
            מותר להשתמש בהם לצורך האירוע שלכם, כולל הדפסה ושיתוף של מה שהמערכת
            מפיקה בשבילכם (כרטיסי שם, הזמנות, קבצי אקסל). אסור להעתיק את השירות
            עצמו או ליצור ממנו שירות מתחרה.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>13. סיום השימוש</h2>
          <p className={styles.text}>
            אפשר להפסיק להשתמש בשירות בכל עת. אירוע אפשר למחוק מתוך האפליקציה.
            למחיקת החשבון כולו פנו אלינו בטלפון או באימייל, ואנחנו נמחק אותו בתוך
            30 יום, חוץ מרישומי תשלום שהחוק מחייב לשמור. מחיקת החשבון מוחקת את כל
            האירועים שבו; החזר על רכישה נקבע לפי <Link to="/refunds">מדיניות הביטול</Link>.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>14. שינויים בתנאים</h2>
          <p className={styles.text}>
            כשנשנה את התנאים נעדכן את התאריך בראש העמוד. על שינוי מהותי נודיע
            באימייל או באתר לפחות 14 יום מראש. השינוי יחול מאותו מועד והלאה, ולא
            יפגע בזכויות לגבי אירוע ששולם עליו לפני השינוי. מי שלא מסכים לשינוי
            יכול להפסיק להשתמש בשירות ולבקש למחוק את החשבון.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>15. הדין והשיפוט</h2>
          <p className={styles.text}>
            על התנאים יחול הדין הישראלי. סמכות השיפוט נתונה לבתי המשפט המוסמכים
            בישראל לפי הדין, כולל בית המשפט לתביעות קטנות.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>16. יצירת קשר</h2>
          <p className={styles.text}>
            בכל שאלה, בקשה או תלונה: <a href={supportMailto()}>{supportEmail()}</a>
            {" "}או בטלפון <a href={legalTel()}>{LEGAL.phone}</a>.
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
