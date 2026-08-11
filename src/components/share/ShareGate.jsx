import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import Icon from "../ui/Icon.jsx";
import styles from "./ShareGate.module.css";

/**
 * The signup moment, moved to where it is honest.
 *
 * Guest mode stays: somebody who wants to see whether this thing works should
 * be able to build a list and press "חשבו הושבה" without handing over an email.
 * But the moment they try to SHARE — the RSVP link, the event site, the shared
 * family table, the invitation — the account stops being a formality and starts
 * being the thing that makes the link work at all:
 *
 *   the public pages (`/rsvp/:token`, `/invite/:token`, …) resolve the token
 *   against Supabase. An event created in guest mode has no cloud row, so the
 *   link a host copies out of the app opens to nothing for every guest they
 *   send it to.
 *
 * So the gate is not a paywall dressed as a feature — it is the truth, said
 * before somebody discovers it by sending forty people a dead link. And it is
 * recoverable: `useEvents` migrates guest drafts (`cloudId === null`) into the
 * account on first login, so the event they already built comes with them.
 */
export default function ShareGateDialog({ what, onClose }) {
  const location = useLocation();
  const cardRef  = useRef(null);
  const firstRef = useRef(null);
  // Where to come back to. LoginScreen already honours `state.from`;
  // SignupScreen now does too, so signing up lands back on the link that
  // triggered this instead of dumping the host on the dashboard.
  const from = location.pathname + location.search;

  useEffect(() => { firstRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const f = cardRef.current?.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (!f || f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.card} ref={cardRef} role="alertdialog" aria-modal="true" aria-label="נדרש חשבון לשיתוף">
        <button className={styles.close} onClick={onClose} aria-label="סגירה">
          <Icon name="close" size={16} />
        </button>

        <div className={styles.mark}><Icon name="cloud" size={20} /></div>

        <h2 className={styles.title}>כדי לשתף צריך חשבון — וזו לא בירוקרטיה</h2>

        <div className={styles.body}>
          <p className={styles.line}>
            {what
              ? `הקישור ל${what} נפתח אצל האורחים מהשרת שלנו.`
              : "קישורי השיתוף נפתחים אצל האורחים מהשרת שלנו."}
            {" "}האירוע הזה נוצר בלי חשבון, ולכן הוא קיים רק בדפדפן הזה — הקישור פשוט לא ייפתח אצל מי שתשלחו לו.
          </p>
          <p className={styles.line}>
            בנוסף, רשימה ששמורה רק כאן נעלמת אם תנקו את הדפדפן או תעברו לטלפון.
          </p>
          <p className={styles.lineStrong}>
            הכל שבניתם עד עכשיו עובר איתכם. לא מתחילים מחדש.
          </p>
        </div>

        <div className={styles.actions}>
          <Link
            ref={firstRef}
            to="/signup"
            state={{ from }}
            className={styles.primary}
          >
            פתחו חשבון חינם <Icon name="arrowLeft" size={15} />
          </Link>
          <Link to="/login" state={{ from }} className={styles.secondary}>
            כבר יש לי חשבון
          </Link>
          <button className={styles.later} onClick={onClose}>לא עכשיו</button>
        </div>
      </div>
    </div>
  );
}
