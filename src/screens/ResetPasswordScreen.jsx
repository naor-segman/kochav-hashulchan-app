import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import styles from "./LoginScreen.module.css";
import Icon from "../components/ui/Icon.jsx";

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

  // Only a RECOVERY session may change a password without knowing the old one.
  //
  // This used to accept any session at all: `getSession()` returning anything
  // set `ready`, and `SIGNED_IN` counted too. On a browser that was already
  // logged in — the shared family laptop, the venue tablet, exactly the devices
  // this product is built around — anyone could open /reset-password, type a
  // new password twice and take the account over with no email and no
  // re-authentication. AccountScreen deliberately re-authenticates with
  // signInWithPassword before allowing a change; this path removed that.
  //
  // Supabase delivers the recovery link's session through PASSWORD_RECOVERY.
  // It can fire before this effect subscribes, so the URL fragment is checked
  // too — `type=recovery` is what the emailed link carries.
  useEffect(() => {
    if (!supabase) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const fromRecoveryLink = /[#&?]type=recovery(&|$)/.test(hash);

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && fromRecoveryLink) setReady(true);
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
                  <Icon name={showPw ? "eyeOff" : "eye"} size={18} />
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
