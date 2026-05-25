import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import styles from "./LoginScreen.module.css"; // shares layout styles

function friendlyError(message) {
  const m = message.toLowerCase();
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "כתובת אימייל זו כבר רשומה. נסה להתחבר.";
  if (m.includes("password") && m.includes("6"))
    return "הסיסמה חייבת להכיל לפחות 6 תווים.";
  if (m.includes("too many requests"))
    return "יותר מדי ניסיונות. נסה שוב מאוחר יותר.";
  if (m.includes("network") || m.includes("fetch failed"))
    return "שגיאת חיבור. נסה שוב.";
  return message;
}

export default function SignupScreen() {
  const { user, loading, signUp } = useAuth();
  const navigate = useNavigate();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [busy,        setBusy]        = useState(false);
  const [done,        setDone]        = useState(false); // email confirmation sent
  const [resentDone,  setResentDone]  = useState(false);
  const [resentBusy,  setResentBusy]  = useState(false);
  const [resentError, setResentError] = useState("");

  useEffect(() => {
    if (!loading && user) navigate("/account", { replace: true });
  }, [loading, user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("הסיסמאות אינן תואמות.");
      return;
    }
    if (password.length < 6) {
      setError("הסיסמה חייבת להכיל לפחות 6 תווים.");
      return;
    }

    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(email.trim(), password);
      if (needsConfirmation) {
        setDone(true);
      } else {
        navigate("/account", { replace: true });
      }
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  const handleResend = async () => {
    if (!supabase || resentBusy) return;
    setResentError("");
    setResentBusy(true);
    try {
      const { error: err } = await supabase.auth.resend({ type: "signup", email: email.trim() });
      if (err) throw err;
      setResentDone(true);
    } catch (err) {
      setResentError("שגיאה בשליחה חוזרת. נסה שוב.");
    } finally {
      setResentBusy(false);
    }
  };

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>✦</span>
            <span className={styles.brandName}>כוכב השולחן</span>
          </div>
          <h1 className={styles.title}>בדוק את האימייל שלך ✉</h1>
          <p style={{ textAlign: "center", color: "var(--text2)", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            שלחנו קישור אישור לכתובת <strong>{email}</strong>.
            לחץ על הקישור לאישור החשבון.
          </p>
          {resentDone ? (
            <p style={{ textAlign: "center", fontSize: 13, color: "var(--green)", margin: 0, fontWeight: 600 }}>
              ✓ הקישור נשלח שוב — בדוק את תיבת הדואר
            </p>
          ) : (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 6px" }}>לא קיבלת אימייל?</p>
              {resentError && <p style={{ fontSize: 12, color: "var(--red)", margin: "0 0 6px" }}>{resentError}</p>}
              <button
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--accent)", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  textDecoration: "underline", padding: 0,
                }}
                onClick={handleResend}
                disabled={resentBusy || !isSupabaseConfigured}
              >
                {resentBusy ? "שולח…" : "שלח שוב"}
              </button>
            </div>
          )}
          <Link to="/login" className={styles.backLink}>← חזרה לכניסה</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>כוכב השולחן</span>
        </div>

        <h1 className={styles.title}>הרשמה</h1>

        {!isSupabaseConfigured && (
          <div className={styles.noticeWarn}>
            הרשמה לחשבון לא זמינה כרגע. ניתן להמשיך במצב אורח — הנתונים נשמרים בדפדפן זה.
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="signup-email">אימייל</label>
            <input
              id="signup-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              dir="ltr"
              autoComplete="email"
              disabled={!isSupabaseConfigured || busy}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="signup-pw">סיסמה</label>
            <input
              id="signup-pw"
              className={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="לפחות 6 תווים"
              dir="ltr"
              autoComplete="new-password"
              disabled={!isSupabaseConfigured || busy}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="signup-confirm">אימות סיסמה</label>
            <input
              id="signup-confirm"
              className={styles.input}
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="הזן שוב את הסיסמה"
              dir="ltr"
              autoComplete="new-password"
              disabled={!isSupabaseConfigured || busy}
              required
            />
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!isSupabaseConfigured || busy || !email || !password || !confirm}
          >
            {busy ? "יוצר חשבון…" : "הרשמה"}
          </button>
        </form>

        <p className={styles.switchLine}>
          כבר יש לך חשבון?{" "}
          <Link to="/login" className={styles.switchLink}>כניסה</Link>
        </p>

        <div className={styles.guestBlock}>
          <Link to="/" className={styles.backLink}>← המשך ללא חשבון</Link>
          <p className={styles.guestNote}>מצב אורח — נתונים נשמרים בדפדפן זה בלבד, ללא גיבוי ענן</p>
        </div>

      </div>
    </div>
  );
}
