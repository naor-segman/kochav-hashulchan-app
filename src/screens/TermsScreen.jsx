import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";

export default function TermsScreen() {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">✦</span>
          <span className={styles.logoName}>כוכב השולחן</span>
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>תנאי שימוש</h1>
        <p className={styles.updated}>עודכן לאחרונה: 21 ביולי 2026</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. השירות</h2>
          <p className={styles.text}>
            כוכב השולחן היא מערכת מקוונת לניהול אירועים: רשימות אורחים, סידורי
            הושבה אוטומטיים, אישורי הגעה, הזמנות דיגיטליות, ברכות וכלים ליום
            האירוע. השימוש בשירות כפוף לתנאים אלה — הרשמה או שימוש מהווים הסכמה.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. חשבון ותוכניות</h2>
          <ul className={styles.list}>
            <li>ההרשמה חינמית. חלק מהיכולות כפופות לתוכנית בתשלום, כמפורט בדף המחירים.</li>
            <li>אתה אחראי לשמירת סודיות פרטי ההתחברות שלך.</li>
            <li>ניתן לבטל תוכנית בתשלום בכל עת; הביטול ייכנס לתוקף בסוף תקופת החיוב הנוכחית.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. תוכן ואחריות המשתמש</h2>
          <ul className={styles.list}>
            <li>הנתונים שאתה מזין (אורחים, טלפונים, פרטי אירוע) הם בבעלותך ובאחריותך.</li>
            <li>אתה מתחייב שיש לך זכות חוקית להשתמש בפרטי האורחים שאתה מעלה.</li>
            <li>שליחת הודעות לאורחים (למשל קישורי אישור הגעה) נעשית על ידך ובאחריותך, בהתאם לדין החל, לרבות דיני הספאם.</li>
            <li>אין להשתמש בשירות לפעילות בלתי חוקית, פוגענית או מטעה.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. ברכות ומתנות</h2>
          <p className={styles.text}>
            דף המתנה מאפשר לאורחים להשאיר ברכה ולציין סכום מתנה. העברת הכסף
            עצמה מתבצעת ישירות בין האורח לבעל האירוע באמצעות שירותי תשלום
            חיצוניים (כגון ביט או PayBox) שבחר בעל האירוע. כוכב השולחן אינה צד
            להעברות אלה, אינה גובה אותן ואינה אחראית להן.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. זמינות ואחריות</h2>
          <p className={styles.text}>
            אנו שואפים לזמינות מלאה אך השירות ניתן "כפי שהוא" (AS IS). מומלץ
            לייצא עותק אקסל של הנתונים לפני האירוע. אחריותנו הכוללת בכל מקרה
            מוגבלת לסכום ששולם לנו בפועל ב-12 החודשים שקדמו לאירוע.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. קניין רוחני</h2>
          <p className={styles.text}>
            כל הזכויות בשירות, בעיצובו ובקוד שלו שמורות לכוכב השולחן. אין
            להעתיק, לשכפל או ליצור יצירות נגזרות ללא אישור בכתב.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. שונות</h2>
          <p className={styles.text}>
            על תנאים אלה יחול הדין הישראלי, וסמכות השיפוט הבלעדית נתונה לבתי
            המשפט המוסמכים בישראל. נעדכן תנאים אלה מעת לעת; המשך שימוש לאחר
            עדכון מהווה הסכמה לנוסח המעודכן.
          </p>
          <p className={styles.text}>
            יצירת קשר: <a href="mailto:support@kochav-hashulchan.co.il">support@kochav-hashulchan.co.il</a>
          </p>
        </section>

        <div className={styles.backRow}>
          <Link to="/" className={styles.backLink}>→ חזרה לדף הבית</Link>
        </div>
      </main>
    </div>
  );
}
