import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";
import SectionMark from "../components/ui/SectionMark.jsx";
import Footer from "../components/layout/Footer.jsx";
import { COMPANY, LEGAL, LEGAL_DOCS, legalTel, supportEmail, supportMailto } from "../data/company.js";

/* Cancellation and refunds (checklist 103 — there was no clause at all).
 *
 * The statutory floor comes from §14ג and §14ה of the Consumer Protection Law
 * and its 2010 cancellation regulations: 14 days from the purchase or from
 * receiving the transaction document, whichever is later; a refund within 14
 * days; a fee of at most 5% or ₪100, whichever is lower, and none when the
 * business is at fault; four months for people with disabilities, citizens over
 * 65 and new immigrants when the sale involved a conversation. Nothing below may
 * give less than that. What goes BEYOND it (postponement, our fault, the human
 * service) is the owner's policy and is marked as such in WORKPLAN 103.
 *
 * The request mail is prefilled so that a cancellation sent from the site
 * carries what we need to find the purchase. */
const CANCEL_SUBJECT = "בקשה לביטול עסקה";
const CANCEL_BODY = [
  "שלום,",
  "אני מבקש/ת לבטל את העסקה הבאה:",
  "האימייל של החשבון:",
  "שם האירוע:",
  "תאריך הרכישה:",
  "",
  "תודה",
].join("\n");

function cancelMailto() {
  const q = `subject=${encodeURIComponent(CANCEL_SUBJECT)}&body=${encodeURIComponent(CANCEL_BODY)}`;
  return `${supportMailto()}?${q}`;
}

export default function RefundScreen() {
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
          <h1 className={styles.title}>ביטול עסקה והחזרים</h1>
        </div>
        <p className={styles.updated}>עודכן לאחרונה: {LEGAL_DOCS.updated}</p>

        {/* Operator identity — checklist 19–20. An empty address prints NO
            ROW rather than a blank. */}
        <section className={styles.identity}>
          <h2 className={styles.identityTitle}>למי פונים</h2>
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
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. על מה המדיניות חלה</h2>
          <p className={styles.text}>
            על כל רכישה ב{COMPANY.name}: חבילה לאירוע, ושירות שנותן אדם (למשל מנהל
            הושבה בכניסה ביום האירוע). רכישה היא תשלום חד-פעמי לאירוע אחד — אין
            מנוי, ולכן אין גם חיוב חוזר לבטל. המדיניות הזו לא גורעת מאף זכות
            שיש לכם לפי חוק הגנת הצרכן.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>2. ביטול בתוך 14 יום</h2>
          <ul className={styles.list}>
            <li>אפשר לבטל רכישה בתוך 14 יום מיום הרכישה, או מיום שקיבלתם באימייל את אישור העסקה — המאוחר מביניהם.</li>
            <li>נחזיר את הכסף בתוך 14 יום מיום שקיבלנו את הודעת הביטול, לאותו אמצעי תשלום.</li>
            <li>מהסכום יקוזזו דמי ביטול של 5% מהמחיר או 100 ₪ — הנמוך מביניהם.</li>
            <li>אנשים עם מוגבלות, אזרחים ותיקים (מגיל 65) ועולים חדשים (עד חמש שנים מיום העלייה) יכולים לבטל בתוך ארבעה חודשים, אם העסקה כללה שיחה איתנו (גם בוואטסאפ או בטלפון). צרפו לבקשה תעודה מתאימה.</li>
            <li>בשירות שנותן אדם (סעיף 5), הודעת הביטול צריכה להגיע אלינו לפחות שני ימים שאינם ימי מנוחה לפני מועד האירוע.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>3. כשהבעיה אצלנו</h2>
          <p className={styles.text}>
            אם הייתה בשירות תקלה מהותית שדיווחתם לנו עליה ולא תיקנו אותה בזמן
            לאירוע, או שלא סיפקנו שירות שהתחייבנו אליו — תקבלו החזר מלא, בלי דמי
            ביטול, גם אחרי 14 יום.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>4. האירוע נדחה או בוטל</h2>
          <ul className={styles.list}>
            <li><strong>נדחה</strong> — החבילה נשארת עם האירוע, אם המועד החדש בתוך 12 חודשים מהרכישה. משנים את התאריך באפליקציה, וכל השאר נשאר כמו שהוא.</li>
            <li><strong>בוטל, אחרי 14 יום מהרכישה</strong> — ההחזר אינו מובטח. פנו אלינו, ונשקול החזר חלקי או העברת החבילה לאירוע אחר.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>5. שירות שנותן אדם</h2>
          <p className={styles.text}>
            ביום האירוע מגיע אליכם איש צוות שתיאמנו איתכם מראש. הזכות לבטל בתוך 14
            יום (סעיף 2) חלה גם כאן. גם אחרי 14 יום מהרכישה, ועד 14 יום לפני
            האירוע, אפשר לבטל את השירות האנושי ולהישאר עם החבילה הדיגיטלית, ונחזיר
            את ההפרש במחיר. בביטול מאוחר יותר לא נוכל להחזיר, כי איש הצוות כבר שמר
            עבורכם את המועד.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>6. איך מבטלים</h2>
          <ul className={styles.list}>
            <li>
              באימייל — <a href={cancelMailto()}>שליחת בקשת ביטול</a> (ייפתח מייל
              מוכן לכתובת {supportEmail()}).
            </li>
            <li>בטלפון — <a href={legalTel()}>{LEGAL.phone}</a>.</li>
            <li>ב<Link to="/feedback">טופס הפנייה באתר</Link> — כתבו "ביטול עסקה" ואת הפרטים שלמטה, והשאירו דרך לחזור אליכם.</li>
            {LEGAL.address && <li>בדואר — {LEGAL.address}.</li>}
          </ul>
          <p className={styles.text}>
            ציינו את האימייל של החשבון, את שם האירוע ואת תאריך הרכישה, כדי שנמצא
            את העסקה מהר. נאשר בכתב שקיבלנו את הבקשה.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>7. מה קורה אחרי ביטול</h2>
          <p className={styles.text}>
            אחרי ההחזר נוריד את החבילה מהאירוע, והוא יחזור למסלול החינמי. שום דבר
            לא נמחק: הרשימה, ההושבה וכל מה שהזנתם נשארים אצלכם, ואפשר להמשיך לעבוד
            בכפוף למגבלות המסלול החינמי, או לרכוש שוב.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>8. מסמכים קשורים</h2>
          <p className={styles.text}>
            <Link to="/terms">תנאי השימוש</Link> · <Link to="/privacy">מדיניות הפרטיות</Link> · <Link to="/pricing">המחירים</Link>
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
