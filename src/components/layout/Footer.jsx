import { Link } from "react-router-dom";
import styles from "./Footer.module.css";
import { COMPANY, supportMailto } from "../../data/company.js";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link to="/" className={styles.logo}>
            <span className={styles.logoMark}>✦</span>
            <span className={styles.logoName}>{COMPANY.name}</span>
          </Link>
          {/* Factual, not superlative. "המובילה" is the same unearned claim as
              the invented statistics that were removed from the landing page —
              a product this new has not earned it. This says what the tool does. */}
          <p className={styles.tagline}>
            סידור הושבה אוטומטי, ניהול אורחים ואישורי הגעה — לאירועים בישראל.
          </p>
        </div>

        <div className={styles.cols}>
          <div className={styles.col}>
            <div className={styles.colTitle}>מוצר</div>
            {/* /home, not / — App.jsx sends a signed-in user from / straight to
                /app, so these two dropped every logged-in visitor on the
                dashboard. /home renders the landing page unconditionally.
                Kept as <Link> so it is a client-side navigation: a full reload
                would re-download the app to scroll to a section. */}
            <Link to="/home#features" className={styles.colLink}>תכונות</Link>
            <Link to="/home#how" className={styles.colLink}>איך זה עובד</Link>
            <Link to="/pricing" className={styles.colLink}>מחירים</Link>
          </div>
          <div className={styles.col}>
            <div className={styles.colTitle}>חשבון</div>
            <Link to="/signup" className={styles.colLink}>הרשמה חינם</Link>
            <Link to="/login" className={styles.colLink}>כניסה</Link>
            <Link to="/account" className={styles.colLink}>הגדרות</Link>
          </div>
          <div className={styles.col}>
            <div className={styles.colTitle}>תמיכה ומידע</div>
            <Link to="/help" className={styles.colLink}>מרכז עזרה</Link>
            <a href={supportMailto()} className={styles.colLink}>צרו קשר</a>
            <Link to="/privacy" className={styles.colLink}>מדיניות פרטיות</Link>
            <Link to="/terms" className={styles.colLink}>תנאי שימוש</Link>
            <Link to="/accessibility" className={styles.colLink}>הצהרת נגישות</Link>
          </div>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.bottomInner}>
          <span className={styles.copy}>© {new Date().getFullYear()} {COMPANY.name}. כל הזכויות שמורות.</span>
        </div>
      </div>
    </footer>
  );
}
