import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";

export default function PrivacyScreen() {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">✦</span>
          <span className={styles.logoName}>כוכב השולחן</span>
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>מדיניות פרטיות</h1>
        <p className={styles.updated}>עודכן לאחרונה: 21 ביולי 2026</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. כללי</h2>
          <p className={styles.text}>
            כוכב השולחן ("השירות", "אנחנו") היא מערכת לניהול הושבה ואירועים.
            מסמך זה מסביר איזה מידע נאסף, כיצד הוא נשמר ומה הזכויות שלך.
            השימוש בשירות מהווה הסכמה למדיניות זו. אנו פועלים בהתאם לחוק הגנת
            הפרטיות, התשמ"א-1981, על תיקוניו.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. איזה מידע אנחנו אוספים</h2>
          <ul className={styles.list}>
            <li><strong>פרטי חשבון</strong> — כתובת אימייל וסיסמה מוצפנת, לצורך הרשמה והתחברות.</li>
            <li><strong>נתוני אירועים</strong> — שמות אירועים, רשימות אורחים (שמות, מספרי מוזמנים, טלפונים והערות שהזנת), שולחנות, סידורי הושבה ועלויות.</li>
            <li><strong>תשובות אישורי הגעה</strong> — שם, טלפון (אופציונלי) ומספר מגיעים שמזין אורח בדף אישור ההגעה הציבורי.</li>
            <li><strong>ברכות ומתנות</strong> — שם, ברכה וסכום שמזין אורח בדף המתנה.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. אחריותך כמנהל אירוע</h2>
          <p className={styles.text}>
            רשימות האורחים שאתה מעלה לשירות הן באחריותך. בהעלאת פרטי אורחים אתה
            מצהיר שיש לך בסיס חוקי להחזיק בהם ולעשות בהם שימוש לצורך ניהול
            האירוע, וששליחת הודעות לאורחים על ידך תיעשה בהתאם לדין, לרבות חוק
            התקשורת (בזק ושידורים), התשמ"ב-1982.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. היכן המידע נשמר</h2>
          <p className={styles.text}>
            המידע נשמר בשני מקומות: בדפדפן שלך (אחסון מקומי במכשיר) ובשרתי הענן
            של ספקית התשתית Supabase, המאוחסנים במרכזי נתונים מאובטחים. התקשורת
            מוצפנת (HTTPS/TLS). איננו מוכרים או משכירים מידע אישי לצדדים שלישיים.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. שיתוף מידע</h2>
          <p className={styles.text}>
            דפי האירוע הציבוריים (אישור הגעה, הזמנה, מתנה, דיילות) נגישים רק למי
            שמחזיק בקישור הייחודי שיצרת ובחרת לשתף. דף הדיילות מציג שמות אורחים
            ומספרי שולחן בלבד — ללא טלפונים.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. זכויותיך</h2>
          <p className={styles.text}>
            באפשרותך לעיין במידע שלך, לתקנו או למחוק את חשבונך ואת כל נתוני
            האירועים שלך בכל עת דרך מסך החשבון, או בפנייה אלינו. מחיקת אירוע
            מוחקת גם את תשובות אישורי ההגעה והברכות המשויכות אליו.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. יצירת קשר</h2>
          <p className={styles.text}>
            לכל שאלה בנושא פרטיות: <a href="mailto:support@kochav-hashulchan.co.il">support@kochav-hashulchan.co.il</a>
          </p>
        </section>

        <div className={styles.backRow}>
          <Link to="/" className={styles.backLink}>→ חזרה לדף הבית</Link>
        </div>
      </main>
    </div>
  );
}
