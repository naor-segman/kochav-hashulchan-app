import { useState, useEffect, useRef } from "react";
import Icon from "../components/ui/Icon.jsx";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { track, EVENTS } from "../lib/analytics.js";
import { useAuth } from "../hooks/useAuth.js";
import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { COMPANY, LEGAL_DOCS } from "../data/company.js";
import styles from "./LoginScreen.module.css"; // shares layout styles
import Logo from "../components/brand/Logo.jsx";
import SupportLine from "../components/support/SupportLine.jsx";
import AuthAside from "../components/auth/AuthAside.jsx";
import { authErrorMessage, isAuthInputError } from "../utils/authErrors.js";

export default function SignupScreen() {
  const { user, loading, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Signup used to land on the dashboard unconditionally. That is wrong when
  // the reason somebody is here is that they pressed "share" three screens
  // deep: the account exists to make THAT link work, and `useEvents` has
  // already carried the guest draft over, so the honest place to return to is
  // the page that sent them. LoginScreen has honoured this for a while.
  const from = location.state?.from || "/app";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  // Which fields the error is about: "password" | "confirm" | "all" | "".
  const [invalid,  setInvalid]  = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [agree,    setAgree]    = useState(false);
  const consentRef = useRef(null);
  const [busy,        setBusy]        = useState(false);
  const [done,        setDone]        = useState(false); // email confirmation sent
  const [resentDone,  setResentDone]  = useState(false);
  const [resentBusy,  setResentBusy]  = useState(false);
  const [resentError, setResentError] = useState("");

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [loading, user, navigate, from]);

  // The form that had the focus is replaced by "check your email"; the focus
  // goes to its heading instead of falling to <body> (AX6).
  const doneHeadingRef = useRef(null);
  useEffect(() => { if (done) doneHeadingRef.current?.focus(); }, [done]);

  // Fields are readOnly and the button aria-disabled while busy — NOT
  // `disabled`, which drops the keyboard focus to <body> on submit (AX6).
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setInvalid("");

    if (password !== confirm) {
      setError("הסיסמאות אינן תואמות.");
      setInvalid("confirm");
      return;
    }
    if (password.length < 6) {
      setError("הסיסמה חייבת להכיל לפחות 6 תווים.");
      setInvalid("password");
      return;
    }
    // Checklist 103: agreeing to the terms is an act, not a side effect of
    // pressing "הרשמה" — and the version agreed to is recorded with the user.
    if (!agree) {
      setError("כדי להירשם צריך לאשר את תנאי השימוש ומדיניות הפרטיות.");
      // The box itself is the thing to fix: marked invalid, tied to the
      // message, and focused (it stayed on the confirm field — review 5.10).
      setInvalid("consent");
      consentRef.current?.focus();
      return;
    }

    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(email.trim(), password, {
        terms_version: LEGAL_DOCS.version,
        terms_accepted_at: new Date().toISOString(),
      });
      // Step 1 of the funnel. Fired on success only — a failed attempt is a
      // different question, and counting it here would inflate the top of the
      // funnel with people who never got in.
      track(EVENTS.SIGNED_UP, { needs_confirmation: needsConfirmation });
      if (needsConfirmation) {
        setDone(true);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(authErrorMessage(err, "signUp"));
      setInvalid(isAuthInputError(err) ? "all" : "");
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
      setResentError(authErrorMessage(err, "resend"));
    } finally {
      setResentBusy(false);
    }
  };

  if (done) {
    return (
      <main id="main" tabIndex={-1} className={styles.page}>
        <div className={styles.formSide}>
          <div className={styles.card}>
            <div className={styles.brand}>
              <Logo className={styles.brandLogo} title={COMPANY.name} />
            </div>
            <h1 className={styles.title} tabIndex={-1} ref={doneHeadingRef}>בדקו את האימייל שלכם</h1>
            <p className={styles.confirmBody}>
              שלחנו קישור אישור לכתובת <strong>{email}</strong>.
              לחצו על הקישור לאישור החשבון.
            </p>
            {resentDone ? (
              <p className={styles.confirmSuccess} role="status">✓ הקישור נשלח שוב — בדקו את תיבת הדואר</p>
            ) : (
              <div className={styles.resendWrap}>
                <p className={styles.resendNote}>לא קיבלתם אימייל?</p>
                {resentError && <p id="resend-error" role="alert" className={styles.resendError}>{resentError}</p>}
                <button
                  type="button"
                  className={styles.resendBtn}
                  onClick={handleResend}
                  disabled={!isSupabaseConfigured}
                  aria-disabled={resentBusy || undefined}
                  aria-describedby={resentError ? "resend-error" : undefined}
                >
                  {resentBusy ? "שולחים…" : "שלחו שוב"}
                </button>
              </div>
            )}
            <Link to="/login" className={styles.backLink}>→ חזרה לכניסה</Link>
            <SupportLine className={styles.help} />
          </div>
        </div>
        <AuthAside />
      </main>
    );
  }

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

          <h1 className={styles.title}>הרשמה</h1>
          <p className={styles.lead}>חשבון חינם — והאירוע נשמר בענן, נפתח מכל מכשיר, ואפשר לשלוח לאורחים את הקישור.</p>

          {!isSupabaseConfigured && (
            <div className={styles.noticeWarn}>
              הרשמה לחשבון לא זמינה כרגע. אפשר להמשיך בלי חשבון — הכל נשמר בדפדפן הזה.
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
                disabled={!isSupabaseConfigured}
                readOnly={busy}
                aria-invalid={invalid === "all" || undefined}
                aria-describedby={error ? "signup-error" : undefined}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-pw">סיסמה</label>
              <div className={styles.passwordWrap}>
                <input
                  id="signup-pw"
                  className={styles.input}
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 6 תווים"
                  dir="ltr"
                  autoComplete="new-password"
                  disabled={!isSupabaseConfigured}
                  readOnly={busy}
                  aria-invalid={invalid === "all" || invalid === "password" || undefined}
                  aria-describedby={error ? "signup-error" : undefined}
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? "הסתירו סיסמה" : "הציגו סיסמה"}
                >
                  {showPw ? <Icon name="eyeOff" size={18} /> : <Icon name="eye" size={18} />}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-confirm">אימות סיסמה</label>
              <input
                id="signup-confirm"
                className={styles.input}
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="הזינו שוב את הסיסמה"
                dir="ltr"
                autoComplete="new-password"
                disabled={!isSupabaseConfigured}
                readOnly={busy}
                aria-invalid={invalid === "all" || invalid === "confirm" || undefined}
                aria-describedby={error ? "signup-error" : undefined}
                required
              />
            </div>

            <label className={styles.consent}>
              <input
                type="checkbox"
                ref={consentRef}
                className={styles.consentBox}
                aria-invalid={invalid === "consent" || undefined}
                aria-describedby={invalid === "consent" ? "signup-error" : undefined}
                checked={agree}
                onChange={e => setAgree(e.target.checked)}
                disabled={!isSupabaseConfigured || busy}
              />
              <span>
                אני מעל גיל 18, וקראתי ואני מסכים/ה ל
                <Link to="/terms" target="_blank" rel="noopener" className={styles.consentLink}>תנאי השימוש</Link>
                {" "}ול
                <Link to="/privacy" target="_blank" rel="noopener" className={styles.consentLink}>מדיניות הפרטיות</Link>
              </span>
            </label>

            {error && <p id="signup-error" role="alert" className={styles.errorMsg}>{error}</p>}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={!isSupabaseConfigured || !email || !password || !confirm}
              aria-disabled={busy || undefined}
            >
              {busy ? "יוצרים חשבון…" : "הרשמה"}
            </button>
          </form>

          <p className={styles.or}>או</p>

          {/* "והכל יסונכרן לענן" was not what happens from here: a draft made
              without an account joins it on "צרפו לחשבון" (decision 33d), not by
              itself. "עובר איתכם" is true either way. */}
          <div className={styles.guestBlock}>
            <Link to="/app" className={styles.guestBtn}>המשיכו בלי חשבון ←</Link>
            <p className={styles.guestNote}>רק רוצים לנסות? פותחים חשבון כשתרצו — ומה שבניתם עובר איתכם.</p>
          </div>

          <p className={styles.switchLine}>
            כבר יש לכם חשבון?{" "}
            <Link to="/login" className={styles.switchLink}>כניסה</Link>
          </p>

          <SupportLine className={styles.help} />

        </div>
      </div>
      <AuthAside />
    </main>
  );
}
