import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import styles from "./LoginScreen.module.css";
import SupportLine from "../components/support/SupportLine.jsx";
import AuthAside from "../components/auth/AuthAside.jsx";
import Icon from "../components/ui/Icon.jsx";
import { COMPANY } from "../data/company.js";
import { authErrorMessage, isAuthInputError } from "../utils/authErrors.js";

/* The link in the reset email (131, owner 3.10).
 *
 * It used to be Supabase's own /verify link: a ONE-TIME GET that spends the
 * token the moment anything opens it. Mail scanners do exactly that (Outlook's
 * link check fetches every link before the person sees it), and so does a
 * second reset request, which voids the first. The owner clicked a fresh link
 * and got "הקישור אינו תקף".
 *
 * The email now links HERE with `?token_hash=…&type=recovery`
 * (supabase/email-templates/reset-password.html), and nothing is spent on
 * arrival: the form shows at once and the token is verified only when the
 * person presses "עדכנו סיסמה". A scanner reads a page; it does not fill in
 * two password fields and submit them.
 *
 * And when a link IS spent or expired, the page says so plainly and sends a new
 * one from right here — not "go back to the login screen and start over".
 */
function readLink() {
  if (typeof window === "undefined") return { tokenHash: "", spent: false, fromRecoveryLink: false };
  const q = new URLSearchParams(window.location.search);
  const hash = window.location.hash || "";
  const tokenHash = q.get("type") === "recovery" ? (q.get("token_hash") || "") : "";
  return {
    tokenHash,
    // Supabase's own link, when it failed, lands with #error_code=otp_expired.
    spent: /[#&]error(_code)?=/.test(hash),
    fromRecoveryLink: /[#&?]type=recovery(&|$)/.test(hash),
  };
}

export default function ResetPasswordScreen() {
  const navigate = useNavigate();
  const [link] = useState(readLink);
  const [ready,    setReady]    = useState(!!link.tokenHash);  // a form to show
  const [checking, setChecking] = useState(!!supabase && !link.tokenHash); // no cloud → nothing to verify
  const [verified, setVerified] = useState(false);  // the token_hash has been spent — by us
  const [expired,  setExpired]  = useState(false);
  const [email,    setEmail]    = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sent,     setSent]     = useState(false);
  const [sendError, setSendError] = useState("");
  const [pw,   setPw]   = useState("");
  const [pw2,  setPw2]  = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(""); // "pw" | "pw2" | "all" | ""
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
    // The new link verifies on submit — nothing to wait for, nothing to spend.
    if (!supabase || link.tokenHash) return undefined;
    const fromRecoveryLink = link.fromRecoveryLink;

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && fromRecoveryLink) setReady(true);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, [link]);

  // Fields readOnly and the button aria-disabled while busy — not `disabled`,
  // which drops the keyboard focus to <body> on submit (AX6).
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (pw.length < 6) { setError("הסיסמה חייבת להכיל לפחות 6 תווים."); setInvalid("pw"); return; }
    if (pw !== pw2)    { setError("הסיסמאות אינן תואמות."); setInvalid("pw2"); return; }
    setBusy(true); setError(""); setInvalid("");
    try {
      // Spend the link only now, on the person's own submit. Once spent it is
      // not spent again: a server-side refusal of the password (too weak)
      // leaves the recovery session in place for the next try.
      if (link.tokenHash && !verified) {
        const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: "recovery" });
        if (vErr) { setExpired(true); return; }
        setVerified(true);
      }
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      setDone(true);
      setTimeout(() => navigate("/app", { replace: true }), 1400);
    } catch (err) {
      setError(authErrorMessage(err, "updatePassword"));
      setInvalid(isAuthInputError(err) ? "all" : "");
    } finally {
      setBusy(false);
    }
  };

  const sendNew = async (e) => {
    e.preventDefault();
    if (sendBusy || !email.trim()) return;
    setSendBusy(true); setSendError("");
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setSendError(authErrorMessage(err, "resetEmail"));
    } finally {
      setSendBusy(false);
    }
  };

  const showExpired = expired || link.spent || (!checking && !ready);

  return (
    <main className={styles.page}>
      <div className={styles.formSide}>
        <div className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">✦</span>
            <span className={styles.brandName}>{COMPANY.name}</span>
          </div>
          <h1 className={styles.title}>בחירת סיסמה חדשה</h1>
          <p className={styles.lead}>עוד רגע אתם בפנים — בוחרים סיסמה, וממשיכים מאיפה שהפסקתם.</p>

          {done ? (
            <p className={styles.forgotSuccess} role="status">הסיסמה עודכנה בהצלחה ✓ מעבירים אתכם…</p>
          ) : checking ? (
            <p className={styles.forgotSuccess}>מאמתים את הקישור…</p>
          ) : showExpired ? (
            sent ? (
              <p className={styles.forgotSuccess} role="status">
                שלחנו קישור חדש ל-<span dir="ltr">{email.trim()}</span>. פתחו את המייל האחרון שהגיע — הקודמים כבר לא פעילים.
              </p>
            ) : (
              <>
                <div className={styles.noticeWarn} role="status">
                  הקישור הזה כבר לא פעיל — כל בקשת איפוס חדשה מבטלת את הקודמת, וקישור תקף לשעה. שלחו לעצמכם קישור חדש:
                </div>
                <form onSubmit={sendNew} className={styles.form} noValidate>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="rp-email">כתובת האימייל</label>
                    <input
                      id="rp-email"
                      className={styles.input}
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      dir="ltr"
                      autoComplete="email"
                      readOnly={sendBusy}
                      aria-describedby={sendError ? "rp-send-error" : undefined}
                      required
                    />
                  </div>
                  {sendError && <p id="rp-send-error" role="alert" className={styles.errorMsg}>{sendError}</p>}
                  <button type="submit" className={styles.submitBtn} disabled={!email.trim()} aria-disabled={sendBusy || undefined}>
                    {sendBusy ? "שולחים…" : "שלחו לי קישור חדש"}
                  </button>
                </form>
                <Link to="/login" className={styles.switchLink} style={{ textAlign: "center" }}>חזרה לכניסה</Link>
              </>
            )
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
                    readOnly={busy}
                    aria-invalid={invalid === "all" || invalid === "pw" || undefined}
                    aria-describedby={error ? "rp-error" : undefined}
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
                  readOnly={busy}
                  aria-invalid={invalid === "all" || invalid === "pw2" || undefined}
                  aria-describedby={error ? "rp-error" : undefined}
                  required
                />
              </div>

              {error && <p id="rp-error" role="alert" className={styles.errorMsg}>{error}</p>}

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={!pw || !pw2}
                aria-disabled={busy || undefined}
              >
                {busy ? "מעדכנים…" : "עדכנו סיסמה"}
              </button>
            </form>
          )}
          <SupportLine className={styles.help} />
        </div>
      </div>
      <AuthAside />
    </main>
  );
}
