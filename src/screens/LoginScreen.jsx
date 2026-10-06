import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import styles from "./LoginScreen.module.css";
import Logo from "../components/brand/Logo.jsx";
import SupportLine from "../components/support/SupportLine.jsx";
import AuthAside from "../components/auth/AuthAside.jsx";
import Icon from "../components/ui/Icon.jsx";
import { COMPANY } from "../data/company.js";
import { authErrorMessage, isAuthInputError } from "../utils/authErrors.js";

export default function LoginScreen() {
  const { user, loading, signIn } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from || "/app";

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState(location.state?.error || "");
  const [invalid,     setInvalid]     = useState(false); // the credentials were wrong
  const [busy,        setBusy]        = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [forgotMode,  setForgotMode]  = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy,  setForgotBusy]  = useState(false);
  const [forgotDone,  setForgotDone]  = useState(false);
  const [forgotError, setForgotError] = useState("");

  // The form that had the focus is replaced by the confirmation; put the focus
  // on the confirmation rather than let it fall to <body> (AX6).
  const forgotDoneRef = useRef(null);
  useEffect(() => { if (forgotDone) forgotDoneRef.current?.focus(); }, [forgotDone]);

  // Opening "שכחתם סיסמה?" replaced the focused button with the panel, and
  // "→ חזרו לכניסה" replaced the focused back button with the link: both times
  // focus fell to <body> (review 5.10). Into the email field, and back.
  const forgotInputRef = useRef(null);
  const forgotLinkRef = useRef(null);
  const forgotOpened = useRef(false);
  useEffect(() => {
    if (forgotMode && !forgotDone) { forgotInputRef.current?.focus(); forgotOpened.current = true; }
    else if (!forgotMode && forgotOpened.current) forgotLinkRef.current?.focus();
  }, [forgotMode, forgotDone]);

  // Already logged in → redirect
  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [loading, user, navigate, from]);

  // While a request is in flight the fields are readOnly and the button
  // aria-disabled — NOT `disabled`. Disabling the control that has the focus
  // (the button that was clicked, the field Enter was pressed in) drops the
  // keyboard focus to <body>, so a screen-reader user lost their place on
  // every submit and the error that followed was read from nowhere (AX6).
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setInvalid(false);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, "signIn"));
      setInvalid(isAuthInputError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (forgotBusy || !forgotEmail.trim()) return;
    setForgotError("");
    setForgotBusy(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (err) throw err;
      setForgotDone(true);
    } catch (err) {
      setForgotError(authErrorMessage(err, "resetEmail"));
    } finally {
      setForgotBusy(false);
    }
  };

  if (loading) return (
    <main id="main" tabIndex={-1} className={styles.page}>
      <span className={styles.loadingMark} aria-hidden="true">✦</span>
      <span className="sr-only" role="status">טוען…</span>
    </main>
  );

  return (
    <main id="main" tabIndex={-1} className={styles.page}>
      <div className={styles.formSide}>
        {/* The only way back to the marketing site — the card itself has no nav
            and no footer, and the wordmark inside it is not a link. */}
        <div className={styles.homeRow}>
          <Link to="/" className={styles.homeLink}>→ חזרה לדף הבית</Link>
        </div>

        <div className={styles.card}>

          <div className={styles.brand}>
            <Logo className={styles.brandLogo} title={COMPANY.name} />
          </div>

          <h1 className={styles.title}>כניסה לחשבון</h1>
          {/* Sent here from a page that needs an account (the footer's
              "הגדרות" → /account): say why, and that they go straight back —
              it arrived with no explanation (review 5.10). */}
          <p className={styles.lead}>
            {from !== "/app"
              ? "כדי להמשיך לשם צריך להיכנס לחשבון — ומיד אחרי זה נחזיר אתכם בדיוק לאותו מקום."
              : "האירוע שלכם מחכה בדיוק איפה שהשארתם אותו."}
          </p>

          {/* This mode was called "guest mode" here, and in a product about
              guests that reads as the guest's own view. It is "בלי חשבון"
              everywhere now (authEntry.test.js). */}
          {!isSupabaseConfigured && (
            <div className={styles.noticeWarn}>
              כניסה לחשבון לא זמינה כרגע. אפשר להמשיך בלי חשבון — הכל נשמר בדפדפן הזה.
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
                disabled={!isSupabaseConfigured}
                readOnly={busy}
                aria-invalid={invalid || undefined}
                aria-describedby={error ? "login-error" : undefined}
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
                  dir="ltr"
                  autoComplete="current-password"
                  disabled={!isSupabaseConfigured}
                  readOnly={busy}
                  aria-invalid={invalid || undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? "הסתירו סיסמה" : "הציגו סיסמה"}
                >
                  <Icon name={showPw ? "eyeOff" : "eye"} size={18} />
                </button>
              </div>
            </div>

            {error && <p id="login-error" role="alert" className={styles.errorMsg}>{error}</p>}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!isSupabaseConfigured || !email || !password}
              aria-disabled={busy || undefined}
            >
              {busy ? "מתחברים…" : "כניסה"}
            </button>
          </form>

          {/* ── Forgot password ── */}
          {!forgotMode ? (
            <button
              ref={forgotLinkRef}
              type="button"
              className={styles.forgotLink}
              onClick={() => { setForgotMode(true); setForgotEmail(email); }}
              disabled={!isSupabaseConfigured}
            >
              שכחתם סיסמה?
            </button>
          ) : forgotDone ? (
            <div className={styles.forgotSuccess} role="status" tabIndex={-1} ref={forgotDoneRef}>
              ✓ קישור לאיפוס סיסמה נשלח לכתובת <strong>{forgotEmail}</strong>. בדקו את תיבת הדואר.
            </div>
          ) : (
            <form onSubmit={handleForgot} className={styles.forgotForm} noValidate>
              <p className={styles.forgotTitle}>איפוס סיסמה</p>
              <input
                ref={forgotInputRef}
                className={styles.input}
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                placeholder="your@email.com"
                dir="ltr"
                autoComplete="email"
                aria-label="אימייל לאיפוס סיסמה"
                readOnly={forgotBusy}
                aria-describedby={forgotError ? "forgot-error" : undefined}
                required
              />
              {forgotError && <p id="forgot-error" role="alert" className={styles.errorMsg}>{forgotError}</p>}
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={!forgotEmail}
                aria-disabled={forgotBusy || undefined}
              >
                {forgotBusy ? "שולחים…" : "שלחו קישור איפוס"}
              </button>
              <button
                type="button"
                className={styles.forgotLink}
                onClick={() => { setForgotMode(false); setForgotError(""); }}
              >
                → חזרו לכניסה
              </button>
            </form>
          )}

          <p className={styles.or}>או</p>

          <div className={styles.guestBlock}>
            <Link to="/app" className={styles.guestBtn}>המשיכו בלי חשבון ←</Link>
            <p className={styles.guestNote}>הכל נשמר בדפדפן הזה. חשבון פותחים כשרוצים גיבוי בענן או לשלוח קישור לאורחים.</p>
          </div>

          <p className={styles.switchLine}>
            אין לכם חשבון?{" "}
            <Link to="/signup" className={styles.switchLink}>הרשמה חינמית</Link>
          </p>

          <SupportLine className={styles.help} />

        </div>
      </div>
      <AuthAside />
    </main>
  );
}
