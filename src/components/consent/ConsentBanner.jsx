import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { isGuestRoute } from "../../utils/guestRoutes.js";
import { isAuthFormRoute } from "../../utils/authRoutes.js";
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
 * measurement (Google Analytics). No marketing, no personalisation — listing them would
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
 *   • No id, no banner: with VITE_GA_ID unset there is nothing optional
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
      // Cleared there (no answer at all): stop here too — measuring needs a yes.
      applyConsent(v ? v.analytics : false);
    };
    window.addEventListener(CONSENT_OPEN, onOpen);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CONSENT_OPEN, onOpen);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Stays under the preferences while they are open, so closing them puts
  // focus back on "ניהול העדפות" rather than on a button that has gone.
  const showBanner = analyticsConfigured && !answer && !isGuestRoute(pathname);

  /* On a sign-in form the question is a STRIP (136 stage C, owner 5.10). The
     full sheet is 244px at 390 and sat over the signup's consent box, its
     submit and "המשיכו בלי חשבון" until answered — the competitor weakness we
     wrote down as one not to repeat. Same answers, same equal buttons, the same
     "ניהול העדפות" and privacy link; only the explanation is shorter, and the
     full one is one tap away in the preferences. */
  const compact = isAuthFormRoute(pathname);

  /* And the page makes room for it: its height goes into --consent-space,
     which the sign-in page pads its bottom with, so every control can be
     scrolled clear of the strip. Removed the moment the question is answered. */
  const bannerRef = useRef(null);
  useEffect(() => {
    const el = bannerRef.current;
    if (!showBanner || !el) return undefined;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--consent-space", `${Math.ceil(el.getBoundingClientRect().height) + 12}px`);
    set();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty("--consent-space"); };
  }, [showBanner, compact]);

  if (!analyticsConfigured) return null;

  const decide = (yes) => {
    // Answered from the banner itself (or the preferences it opened): the
    // banner goes, and focus with it — to <body>, the top of the page for a
    // keyboard user (3.10 review). The page's own content takes it instead.
    const fromBanner = !!document.activeElement?.closest?.("[data-consent-pending], [data-consent-prefs]") && !answer;
    setAnswer(saveConsent({ analytics: yes }));
    applyConsent(yes);
    setPrefsOpen(false);
    if (fromBanner) {
      setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        const main = document.getElementById("main") || document.querySelector("main");
        main?.focus?.({ preventScroll: true });
      }, 0);
    }
  };


  return (
    <>
      {showBanner && (
        <section
          ref={bannerRef}
          className={compact ? `${styles.banner} ${styles.compact}` : styles.banner}
          aria-labelledby="consent-title"
          // useScreenTour waits while this is on screen: the tour would make
          // the banner inert and cover it, and the question comes first.
          data-consent-pending=""
        >
          <h2 id="consent-title" className={styles.title}>הסכמה לשימוש בעוגיות</h2>
          {compact ? (
            <p className={styles.text}>
              מדידת שימוש רק באישורכם — בלי פרסום ובלי שמות אורחים.{" "}
              <Link to="/privacy#device" className={styles.inlineLink}>מדיניות הפרטיות</Link>
            </p>
          ) : (
            <p className={styles.text}>
              האתר שומר בדפדפן את מה שהוא צריך כדי לפעול — למשל החיבור לחשבון
              והאירועים שלכם. באישורכם נפעיל גם מדידת שימוש, כדי לראות איפה האתר
              לא ברור ולתקן — בלי פרסום, בלי הקלטות מסך ובלי שמות אורחים.{" "}
              <Link to="/privacy#device" className={styles.inlineLink}>מדיניות הפרטיות</Link>
            </p>
          )}
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
      <div className={styles.card} ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="consent-prefs-title" data-consent-prefs="">
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
            מה שהאתר צריך כדי לפעול: החיבור לחשבון, עותק האירועים במכשיר כדי
            שהאפליקציה תעבוד גם בלי רשת, שמות שהקלדתם, מה שכבר ראיתם, וזכירת
            הבחירה הזו. הם לא נשלחים לאף אחד אחר, ולכן אין עליהם בחירה.
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
            עוזרת לנו לראות באיזה שלב אנשים נתקעים. נשמרת עוגייה עם מזהה אקראי
            (עד 13 חודשים), ונשלחים העמוד (בלי קודי הקישורים), מזהה החשבון,
            פרטים כלליים על הדפדפן והמכשיר ואזור גאוגרפי משוער — לא אימייל, לא
            שמות אורחים, לא הקלטות מסך ולא פרסום. דרך Google Analytics.
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
