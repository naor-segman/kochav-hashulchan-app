import { useState } from "react";
import { Link } from "react-router-dom";
import styles from "./LegalScreen.module.css";
import fb from "./FeedbackScreen.module.css";
import SectionMark from "../components/ui/SectionMark.jsx";
import Footer from "../components/layout/Footer.jsx";
import { COMPANY, supportEmail, supportMailto } from "../data/company.js";
import { submitFeedback } from "../utils/feedbackReport.js";

/* Somewhere to say what went wrong.  Checklist 25.
 *
 * The error reporter catches crashes. It cannot catch the button nobody finds,
 * the wording that misleads, or the step that works and is still the wrong
 * step — none of those throw. The only way those reach the owner is if someone
 * types them, and the only way someone types them is if there is somewhere to
 * type. Before the pilot, that somewhere has to exist.
 *
 * This replaces the account screen's `mailto:` link, which depended on the
 * reader having a mail client, arrived with no context about which screen or
 * which browser, and — until the domain is bought — pointed at a mailbox that
 * does not exist. The mail route is still offered underneath, for anyone who
 * would rather write an email.
 */

const KINDS = [
  { id: "bug",   label: "משהו לא עובד" },
  { id: "idea",  label: "רעיון לשיפור" },
  { id: "other", label: "משהו אחר" },
];

const MAX = 4000;

export default function FeedbackScreen() {
  const [kind, setKind]       = useState("bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult]   = useState(null);   // null | "ok" | reason string

  const tooLong = message.length > MAX;
  const canSend = message.trim().length > 0 && !tooLong && !sending;

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    const r = await submitFeedback({ kind, message, contact });
    setSending(false);
    setResult(r.ok ? "ok" : r.reason);
  }

  function reset() {
    setMessage("");
    setContact("");
    setResult(null);
  }

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
          <SectionMark name="help" size={26} tile />
          <h1 className={styles.title}>ספרו לנו</h1>
        </div>

        <p className={fb.hint}>
          מצאתם משהו שלא עובד, או שיש לכם רעיון? כתבו כאן וזה מגיע ישירות אלינו.
          אנחנו קוראים כל הודעה.
        </p>

        {result === "ok" ? (
          <div className={fb.ok} role="status">
            <strong>קיבלנו. תודה.</strong>
            <br />
            {contact.trim()
              ? "אם נצטרך פרטים נוספים ניצור קשר."
              : "אם תרצו שנחזור אליכם, השאירו בפעם הבאה דרך ליצור קשר."}
            <br />
            <button type="button" className={fb.again} onClick={reset}>
              לכתוב עוד משהו
            </button>
          </div>
        ) : (
          <form className={fb.form} onSubmit={onSubmit}>
            <div className={fb.field}>
              <span className={fb.label} id="kindLabel">על מה מדובר?</span>
              <div className={fb.kinds} role="group" aria-labelledby="kindLabel">
                {KINDS.map(k => (
                  <button
                    key={k.id}
                    type="button"
                    className={[fb.kind, kind === k.id && fb.kindOn].filter(Boolean).join(" ")}
                    aria-pressed={kind === k.id}
                    onClick={() => setKind(k.id)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={fb.field}>
              <label className={fb.label} htmlFor="fbMessage">מה קרה?</label>
              <span className={fb.hint}>
                ככל שתכתבו יותר פרטים — באיזה מסך הייתם, מה לחצתם ומה ציפיתם שיקרה — כך נוכל לתקן מהר יותר.
              </span>
              <textarea
                id="fbMessage"
                className={fb.textarea}
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
              />
              {message.length > MAX - 400 && (
                <span className={fb.counter}>
                  {message.length.toLocaleString("he-IL")} מתוך {MAX.toLocaleString("he-IL")} תווים
                </span>
              )}
            </div>

            <div className={fb.field}>
              <label className={fb.label} htmlFor="fbContact">איך לחזור אליכם? (לא חובה)</label>
              <input
                id="fbContact"
                className={fb.input}
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="אימייל או טלפון"
                autoComplete="off"
              />
            </div>

            {result && result !== "ok" && (
              <div className={fb.bad} role="alert">
                {result === "throttled"
                  ? "התקבלו הרבה הודעות ברגע זה ולא הצלחנו לשמור את שלכם. נסו שוב בעוד כמה דקות — "
                  : "לא הצלחנו לשלוח את ההודעה. אפשר לנסות שוב, או לכתוב לנו במייל — "}
                <a href={supportMailto("משוב")}>{supportEmail()}</a>
              </div>
            )}

            <div className={fb.actions}>
              <button type="submit" className={fb.submit} disabled={!canSend}>
                {sending ? "שולח…" : "שליחה"}
              </button>
              {tooLong && (
                <span className={fb.counter}>ההודעה ארוכה מדי — קצרו מעט</span>
              )}
            </div>
          </form>
        )}

        <p className={fb.privacy}>
          יחד עם ההודעה נשמרים המסך שממנו נשלחה וסוג הדפדפן, כדי שנוכל לשחזר את התקלה.
          לא נשמרים פרטי אורחים, ואם השארתם דרך ליצור קשר — היא משמשת רק כדי לחזור אליכם.
        </p>
      </main>

      <Footer />
    </div>
  );
}
