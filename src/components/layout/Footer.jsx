import { Link } from "react-router-dom";
import styles from "./Footer.module.css";
import Logo from "../brand/Logo.jsx";
import { COMPANY, LEGAL, legalLine, contactMailto, contactEmail } from "../../data/company.js";
import { openConsentSettings } from "../../utils/consent.js";
import { analyticsConfigured } from "../../lib/analytics.js";
import { liveServices } from "../../data/services.js";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link to="/" className={styles.logo}>
            <Logo className={styles.logoArt} title={COMPANY.name} />
          </Link>
          {/* Factual, not superlative. "המובילה" is the same unearned claim as
              the invented statistics that were removed from the landing page —
              a product this new has not earned it. This says what the tool does. */}
          <p className={styles.tagline}>
            סידור הושבה אוטומטי, ניהול אורחים ואישורי הגעה — לאירועים בישראל.
          </p>
        </div>

        <div className={styles.cols}>
          {/* The services in the order of the host's journey, as in the bar —
              not "תכונות" / "איך זה עובד", section headings that sent the
              reader down the home page (owner, 6.10). */}
          <div className={styles.col}>
            <div className={styles.colTitle}>השירותים</div>
            {liveServices().map(s => (
              <Link key={s.id} to={s.path} className={styles.colLink}>{s.label}</Link>
            ))}
            <Link to="/pricing" className={styles.colLink}>כמה זה עולה?</Link>
          </div>
          <div className={styles.col}>
            <div className={styles.colTitle}>חשבון</div>
            <Link to="/signup" className={styles.colLink}>הרשמה חינם</Link>
            <Link to="/login" className={styles.colLink}>כניסה</Link>
            <Link to="/account" className={styles.colLink}>הגדרות</Link>
          </div>
          {/* Contact, in the open (136): the payment provider asks for a phone
              and an address on the site, and a buyer looks for them too. */}
          <div className={styles.col}>
            <div className={styles.colTitle}>דברו איתנו</div>
            <a href={`https://wa.me/${COMPANY.whatsapp}`} className={styles.colLink} target="_blank" rel="noreferrer">וואטסאפ</a>
            <a href={`tel:${LEGAL.phone.replace(/\D/g, "")}`} className={styles.colLink}><bdi dir="ltr">{LEGAL.phone}</bdi></a>
            <a href={contactMailto()} className={styles.colLink} title={contactEmail()}>צרו קשר</a>
            {LEGAL.address && <span className={styles.colLink}>{LEGAL.address}</span>}
          </div>
          <div className={styles.col}>
            <div className={styles.colTitle}>תמיכה ומידע</div>
            <Link to="/help" className={styles.colLink}>מרכז עזרה</Link>
            {/* plan@, not plansupport@: "צרו קשר" is the main business address
                (owner 3.10); questions and problems go to support from Help. */}
            <Link to="/privacy" className={styles.colLink}>מדיניות פרטיות</Link>
            {/* Changing the answer is as easy as giving it (owner 3.10). */}
            {analyticsConfigured && (
              <button type="button" className={`${styles.colLink} ${styles.colButton}`} onClick={openConsentSettings}>הגדרות עוגיות</button>
            )}
            <Link to="/terms" className={styles.colLink}>תנאי שימוש</Link>
            <Link to="/refunds" className={styles.colLink}>ביטול והחזרים</Link>
            <Link to="/accessibility" className={styles.colLink}>הצהרת נגישות</Link>
          </div>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={styles.bottomInner}>
          <span className={styles.copy}>© {new Date().getFullYear()} {COMPANY.name}. כל הזכויות שמורות.</span>
          {/* Who actually operates the service, on every page rather than only
              on the three legal ones (checklist 19–20). legalLine() builds it
              from one source in company.js. */}
          <span className={styles.legal}>{legalLine()}</span>
        </div>
      </div>
    </footer>
  );
}
