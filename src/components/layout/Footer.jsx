import { Link } from "react-router-dom";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link to="/" className={styles.logo}>
            <span className={styles.logoMark}>✦</span>
            <span className={styles.logoName}>כוכב השולחן</span>
          </Link>
          <p className={styles.tagline}>
            הפלטפורמה המובילה לסידור הושבה באירועים בישראל
          </p>
        </div>

        <div className={styles.cols}>
          <div className={styles.col}>
            <div className={styles.colTitle}>מוצר</div>
            <a href="/#features" className={styles.colLink}>תכונות</a>
            <a href="/#how" className={styles.colLink}>איך זה עובד</a>
            <Link to="/pricing" className={styles.colLink}>מחירים</Link>
          </div>
          <div className={styles.col}>
            <div className={styles.colTitle}>חשבון</div>
            <Link to="/signup" className={styles.colLink}>הרשמה חינם</Link>
            <Link to="/login" className={styles.colLink}>כניסה</Link>
            <Link to="/account" className={styles.colLink}>הגדרות</Link>
          </div>
          <div className={styles.col}>
            <div className={styles.colTitle}>תמיכה</div>
            <a href="mailto:support@kochav-hashulchan.co.il" className={styles.colLink}>צור קשר</a>
          </div>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.bottomInner}>
          <span className={styles.copy}>© {new Date().getFullYear()} כוכב השולחן. כל הזכויות שמורות.</span>
        </div>
      </div>
    </footer>
  );
}
