import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import styles from "./LoginScreen.module.css";

// Landing page for the password-reset link. Supabase establishes a short-lived
// recovery session from the link; here the user picks a new password.
export default function ResetPasswordScreen() {
  const navigate = useNavigate();
  const [ready,    setReady]    = useState(false);  // recovery session present
  const [checking, setChecking] = useState(!!supabase); // no cloud → nothing to verify
  const [pw,   setPw]   = useState("");
  const [pw2,  setPw2]  = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const [done,  setDone]  = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) { setError("הסיסמה חייבת להכיל לפחות 6 תווים."); return; }
    if (pw !== pw2)    { setError("הסיסמאות אינן תואמות."); return; }
    setBusy(true); setError("");
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      setDone(true);
      setTimeout(() => navigate("/app", { replace: true }), 1400);
    } catch (err) {
      setError(err.message?.includes("network")
        ? "שגיאת חיבור. נסו שוב."
        : "שגיאה בעדכון הסיסמה. ייתכן שהקישור פג תוקפו — בקשו קישור חדש.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>כוכב השולחן</span>
        </div>
        <h1 className={styles.title}>בחירת סיסמה חדשה</h1>

        {done ? (
          <p className={styles.forgotSuccess}>הסיסמה עודכנה בהצלחה ✓ מעבירים אתכם…</p>
        ) : checking ? (
          <p className={styles.forgotSuccess}>מאמתים את הקישור…</p>
        ) : !ready ? (
          <>
            <div className={styles.noticeWarn}>
              הקישור אינו תקף או שפג תוקפו. בקשו קישור איפוס חדש ממסך הכניסה.
            </div>
            <Link to="/login" className={styles.submitBtn} style={{ textAlign: "center", textDecoration: "none" }}>
              חזרה לכניסה
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className={styles.form} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="rp-pw">סיסמה חדשה</label>
              <div className={styles.passwordWrap}>
                <input
                  id="rp-pw"
                  className={styles.input}
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  autoComplete="new-password"
                  disabled={busy}
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? "הסתירו סיסמה" : "הציגו סיסמה"}
                  tabIndex={-1}
                >
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="rp-pw2">אימות סיסמה</label>
              <input
                id="rp-pw2"
                className={styles.input}
                type={showPw ? "text" : "password"}
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                autoComplete="new-password"
                disabled={busy}
                required
              />
            </div>

            {error && <p className={styles.errorMsg}>{error}</p>}

            <button type="submit" className={styles.submitBtn} disabled={busy || !pw || !pw2}>
              {busy ? "מעדכן…" : "עדכנו סיסמה"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
