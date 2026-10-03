import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { isGuestRoute } from "../../utils/guestRoutes.js";
import { readConsent, saveConsent, CONSENT_KEY, CONSENT_OPEN } from "../../utils/consent.js";
import { analyticsConfigured, applyConsent } from "../../lib/analytics.js";
import { useRestoreFocus } from "../../hooks/useRestoreFocus.js";
import Icon from "../ui/Icon.jsx";
import base from "../../styles/screenBase.module.css";
import styles from "./ConsentBanner.module.css";

/**
 * The cookie question (owner 3.10, after the example the owner sent: a bottom sheet
 * with two equal answers and "ניהול העדפות", and a second layer with the
 * categories).
 *
 * What it is honest about: there are exactly TWO categories here. Essential
 * (the login, the events kept on the device, this answer) and usage
 * measurement (PostHog). No marketing, no personalisation — listing them would
 * describe a site that does not exist.
 *
 * The rules it keeps, each one from the law reading of 3.10:
 *   • "אישור" and "סירוב" are the same button — the same size, the same skin.
 *     A loud yes beside a quiet no is the dark pattern the PPA names.
 *   • Nothing is ticked in advance. No answer means no measurement.
 *   • Changing your mind is as easy as answering: the footer, the privacy page
 *     and the account screen all open the same preferences.
 *   • Guests on an RSVP or gift link are never asked: measurement does not run
 *     for them, so there is nothing to ask about.
 *   • No key, no banner: with VITE_POSTHOG_KEY unset there is nothing optional
 *     on the site at all.
 */
export default function ConsentBanner() {
  const { pathname } = useLocation();
  const [answer, setAnswer] = useState(() => readConsent());
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    if (!analyticsConfigured) return undefined;
    const onOpen = () => setPrefsOpen(true);
    // Answered in another tab: this tab follows, so a "no" there stops it here.
    const onStorage = (e) => {
      if (e.key !== CONSENT_KEY) return;
      const v = readConsent();
      setAnswer(v);
      if (v) applyConsent(v.analytics);
    };
    window.addEventListener(CONSENT_OPEN, onOpen);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CONSENT_OPEN, onOpen);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!analyticsConfigured) return null;

  const decide = (yes) => {
    setAnswer(saveConsent({ analytics: yes }));
    applyConsent(yes);
    setPrefsOpen(false);
  };

  // Stays under the preferences while they are open, so closing them puts
  // focus back on "ניהול העדפות" rather than on a button that has gone.
  const showBanner = !answer && !isGuestRoute(pathname);

  return (
    <>
      {showBanner && (
        <section
          className={styles.banner}
          aria-labelledby="consent-title"
          // useScreenTour waits while this is on screen: the tour would make
          // the banner inert and cover it, and the question comes first.
          data-consent-pending=""
        >
          <h2 id="consent-title" className={styles.title}>הסכמה לשימוש בעוגיות</h2>
          <p className={styles.text}>
            האתר שומר בדפדפן רק מה שהוא צריך כדי לעבוד: החיבור לחשבון והאירועים
            שלכם. באישורכם נפעיל גם מדידת שימוש, כדי לראות איפה האתר לא ברור
            ולתקן — בלי פרסום, בלי הקלטות מסך ובלי שמות אורחים.{" "}
            <Link to="/privacy#device" className={styles.inlineLink}>מדיניות הפרטיות</Link>
          </p>
          <div className={styles.actions}>
            <button type="button" className={`${base.btnSecondary} ${styles.answer}`} onClick={() => decide(true)}>אישור</button>
            <button type="button" className={`${base.btnSecondary} ${styles.answer}`} onClick={() => decide(false)}>סירוב</button>
            <button type="button" className={styles.manage} onClick={() => setPrefsOpen(true)}>ניהול העדפות</button>
          </div>
        </section>
      )}
      {prefsOpen && (
        <ConsentPreferences
          initial={answer?.analytics === true}
          onDecide={decide}
          onClose={() => setPrefsOpen(false)}
        />
      )}
    </>
  );
}

function ConsentPreferences({ initial, onDecide, onClose }) {
  const [analytics, setAnalytics] = useState(initial);
  const cardRef = useRef(null);
  const firstRef = useRef(null);

  useRestoreFocus();
  useEffect(() => { firstRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      // Escape closes without deciding: the banner is still there to answer.
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = cardRef.current?.querySelectorAll('button, input:not(:disabled), [href]');
      if (!f || !f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); onClose(); } }}>
      <div className={styles.card} ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="consent-prefs-title">
        <button ref={firstRef} type="button" className={styles.close} onClick={onClose} aria-label="סגירה">
          <Icon name="close" size={16} />
        </button>
        <h2 id="consent-prefs-title" className={styles.prefsTitle}>העדפות עוגיות ופרטיות</h2>
        <p className={styles.text}>
          אפשר לשנות את הבחירה בכל רגע — מהקישור "הגדרות עוגיות" בתחתית האתר,
          ממדיניות הפרטיות או ממסך החשבון.
        </p>

        <div className={styles.category}>
          <label className={styles.catHead}>
            <input type="checkbox" checked disabled className={styles.check} />
            <span className={styles.catName}>חיוניים</span>
            <span className={styles.always}>תמיד פעיל</span>
          </label>
          <p className={styles.catText}>
            החיבור לחשבון, עותק האירועים במכשיר כדי שהאפליקציה תעבוד גם בלי רשת,
            וזכירת הבחירה הזו. בלעדיהם האתר לא עובד, ולכן אין עליהם בחירה.
          </p>
        </div>

        <div className={styles.category}>
          <label className={styles.catHead}>
            <input
              type="checkbox"
              className={styles.check}
              checked={analytics}
              onChange={e => setAnalytics(e.target.checked)}
            />
            <span className={styles.catName}>מדידת שימוש</span>
          </label>
          <p className={styles.catText}>
            עוזרת לנו לראות באיזה שלב אנשים נתקעים. נשמר מזהה אקראי בדפדפן,
            ונשלחים העמוד (בלי קודי הקישורים), מזהה החשבון ופרטים כלליים על
            הדפדפן — לא אימייל, לא שמות אורחים, לא הקלטות מסך ולא מעקב אחרי
            לחיצות. דרך PostHog, בשרתים באירופה.
          </p>
        </div>

        <div className={styles.prefsActions}>
          <button type="button" className={`${base.btnSecondary} ${styles.answer}`} onClick={() => onDecide(true)}>אישור הכל</button>
          <button type="button" className={`${base.btnSecondary} ${styles.answer}`} onClick={() => onDecide(false)}>דחיית הכל</button>
          <button type="button" className={`${base.btnSecondary} ${styles.answer}`} onClick={() => onDecide(analytics)}>שמירת הבחירה</button>
        </div>
      </div>
    </div>
  );
}
