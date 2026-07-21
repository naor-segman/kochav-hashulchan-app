import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";

export default function AccessibilityScreen() {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">✦</span>
          <span className={styles.logoName}>כוכב השולחן</span>
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>הצהרת נגישות</h1>
        <p className={styles.updated}>עודכן לאחרונה: 21 ביולי 2026</p>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>המחויבות שלנו</h2>
          <p className={styles.text}>
            כוכב השולחן רואה חשיבות רבה בהנגשת השירות לכלל המשתמשים, לרבות אנשים
            עם מוגבלות. אנו פועלים להתאמת האתר לתקן הישראלי ת"י 5568 ולהנחיות
            הנגישות הבינלאומיות WCAG 2.1 ברמה AA, בהתאם לתקנות שוויון זכויות
            לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>מה כולל האתר</h2>
          <ul className={styles.list}>
            <li>ניווט מלא באמצעות מקלדת בדפים הציבוריים.</li>
            <li>מבנה כותרות סמנטי ותוויות לקוראי מסך.</li>
            <li>ניגודיות צבעים מותאמת לקריאוּת.</li>
            <li>תמיכה בכיווניות עברית (RTL) לאורך כל המערכת.</li>
            <li>טקסט חלופי לרכיבים חזותיים חשובים.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>הסתייגות</h2>
          <p className={styles.text}>
            אנו משפרים את הנגישות באופן שוטף. ייתכן שחלקים מסוימים טרם הונגשו
            במלואם. אם נתקלת בבעיית נגישות, נשמח שתדווח לנו ונטפל בהקדם.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>פנייה בנושא נגישות</h2>
          <p className={styles.text}>
            רכז הנגישות שלנו זמין בכתובת{" "}
            <a href="mailto:support@kochav-hashulchan.co.il">support@kochav-hashulchan.co.il</a>.
            נשתדל להשיב לכל פנייה בתוך זמן סביר.
          </p>
        </section>

        <div className={styles.backRow}>
          <Link to="/" className={styles.backLink}>→ חזרה לדף הבית</Link>
        </div>
      </main>
    </div>
  );
}
