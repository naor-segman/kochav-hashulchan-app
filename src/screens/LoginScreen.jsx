import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import styles from "./LoginScreen.module.css";

function friendlyError(message) {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "אימייל או סיסמה שגויים.";
  if (m.includes("email not confirmed"))        return "יש לאשר את כתובת האימייל תחילה.";
  if (m.includes("too many requests"))          return "יותר מדי ניסיונות. נסה שוב מאוחר יותר.";
  if (m.includes("network") || m.includes("fetch failed")) return "שגיאת חיבור. נסה שוב.";
  return message;
}

export default function LoginScreen() {
  const { user, loading, signIn } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from || "/account";

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState(location.state?.error || "");
  const [busy,        setBusy]        = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [forgotMode,  setForgotMode]  = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy,  setForgotBusy]  = useState(false);
  const [forgotDone,  setForgotDone]  = useState(false);
  const [forgotError, setForgotError] = useState("");

  // Already logged in → redirect
  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [loading, user, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotError("");
    setForgotBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim());
      if (err) throw err;
      setForgotDone(true);
    } catch (err) {
      setForgotError(err.message?.includes("network") ? "שגיאת חיבור. נסה שוב." : "שגיאה בשליחת הקישור. בדוק את כתובת האימייל.");
    } finally {
      setForgotBusy(false);
    }
  };

  if (loading) return (
    <div className={styles.page}>
      <span className={styles.loadingMark}>✦</span>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>כוכב השולחן</span>
        </div>

        <h1 className={styles.title}>כניסה לחשבון</h1>

        {!isSupabaseConfigured && (
          <div className={styles.noticeWarn}>
            כניסה לחשבון לא זמינה כרגע. ניתן להמשיך במצב אורח — הנתונים נשמרים בדפדפן זה.
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">אימייל</label>
            <input
              id="login-email"
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
            <label className={styles.label} htmlFor="login-pw">סיסמה</label>
            <div className={styles.passwordWrap}>
              <input
                id="login-pw"
                className={styles.input}
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                autoComplete="current-password"
                disabled={!isSupabaseConfigured || busy}
                required
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? "הסתר סיסמה" : "הצג סיסמה"}
                tabIndex={-1}
              >
                {showPw ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={!isSupabaseConfigured || busy || !email || !password}
          >
            {busy ? "מתחבר…" : "כניסה"}
          </button>
        </form>

        {/* ── Forgot password ── */}
        {!forgotMode ? (
          <button
            type="button"
            className={styles.forgotLink}
            onClick={() => { setForgotMode(true); setForgotEmail(email); }}
            disabled={!isSupabaseConfigured}
          >
            שכחת סיסמה?
          </button>
        ) : forgotDone ? (
          <div className={styles.forgotSuccess}>
            ✓ קישור לאיפוס סיסמה נשלח לכתובת <strong>{forgotEmail}</strong>. בדוק את תיבת הדואר.
          </div>
        ) : (
          <form onSubmit={handleForgot} className={styles.forgotForm} noValidate>
            <p className={styles.forgotTitle}>איפוס סיסמה</p>
            <input
              className={styles.input}
              type="email"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              placeholder="your@email.com"
              dir="ltr"
              autoComplete="email"
              required
            />
            {forgotError && <p className={styles.errorMsg}>{forgotError}</p>}
            <button type="submit" className={styles.submitBtn} disabled={forgotBusy || !forgotEmail}>
              {forgotBusy ? "שולח…" : "שלח קישור איפוס"}
            </button>
            <button
              type="button"
              className={styles.forgotLink}
              onClick={() => { setForgotMode(false); setForgotError(""); }}
            >
              ← חזור לכניסה
            </button>
          </form>
        )}

        <p className={styles.switchLine}>
          אין לך חשבון?{" "}
          <Link to="/signup" className={styles.switchLink}>הרשמה חינמית</Link>
        </p>

        <div className={styles.guestBlock}>
          <Link to="/" className={styles.backLink}>← המשך ללא חשבון</Link>
          <p className={styles.guestNote}>מצב אורח — נתונים נשמרים בדפדפן זה בלבד, ללא גיבוי ענן</p>
        </div>

      </div>
    </div>
  );
}
