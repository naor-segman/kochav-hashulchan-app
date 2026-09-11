import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";
import { COMPANY, supportEmail, supportMailto, LEGAL, legalTel } from "../data/company.js";
import SectionMark from "../components/ui/SectionMark.jsx";
import Footer from "../components/layout/Footer.jsx";

export default function AccessibilityScreen() {
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
          <SectionMark name="accessibility" size={26} tile />
          <h1 className={styles.title}>הצהרת נגישות</h1>
        </div>
        <p className={styles.updated}>עודכן לאחרונה: 11 בספטמבר 2026</p>

        {/* Operator identity — checklist 19–20. `address` is empty until the
            owner supplies one, and an empty field prints NO ROW rather than a
            blank: a legal page with "כתובת:" and nothing after it looks like a
            broken template, which is worse than not listing it. */}
        <section className={styles.identity}>
          <h2 className={styles.identityTitle}>מפעיל האתר ורכז הנגישות</h2>
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
          <p className={styles.text}>הפנייה בנושא נגישות מגיעה ישירות לרכז הנגישות, שהוא גם מפעיל השירות. נשתדל להשיב לכל פנייה בתוך זמן סביר.</p>
        </section>


        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>המחויבות שלנו</h2>
          <p className={styles.text}>
            {COMPANY.name} רואה חשיבות רבה בהנגשת השירות לכלל המשתמשים, לרבות אנשים
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
            במלואם. אם נתקלתם בבעיית נגישות, נשמח שתדווחו לנו ונטפל בהקדם.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>פנייה בנושא נגישות</h2>
          {/* The regulations ask for a NAMED coordinator with a way to reach
              them, and this section used to give an email address and nothing
              else — no name, no phone. Someone who cannot use the site is often
              exactly the person who cannot email about it. */}
          <p className={styles.text}>
            רכז הנגישות: <strong>{LEGAL.name}</strong>.
            טלפון: <a href={legalTel()}>{LEGAL.phone}</a>.
            אימייל: <a href={supportMailto()}>{supportEmail()}</a>.
          </p>
          <p className={styles.text}>
            נשמח לקבל כל דיווח על בעיית נגישות — תיאור הבעיה, הדף שבו נתקלתם בה
            והדפדפן שבו השתמשתם עוזרים לנו לטפל מהר. נשתדל להשיב בתוך זמן סביר.
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
