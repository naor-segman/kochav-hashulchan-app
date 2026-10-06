import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { COMPANY } from "../data/company.js";
import styles from "./LoginScreen.module.css";
import Logo from "../components/brand/Logo.jsx";
import SupportLine from "../components/support/SupportLine.jsx";
import AuthAside from "../components/auth/AuthAside.jsx";

/* Where the signup-confirmation email lands (131, owner 3.10).
 *
 * The email used to carry Supabase's own /verify link — a one-time GET that a
 * mail scanner spends before the person ever clicks (the reset link failed for
 * the owner exactly that way). It now links here with
 * `?token_hash=…&type=email` (supabase/email-templates/confirm-signup.html),
 * and the token is spent only when the person presses the button. A scanner
 * reads the page; it does not press the button.
 *
 * A link from before the change (no token_hash) still works the old way:
 * Supabase has already verified it and left a session.
 */
const TYPES = new Set(["email", "signup"]);

function readLink() {
  if (typeof window === "undefined") return { tokenHash: "", type: "" };
  const q = new URLSearchParams(window.location.search);
  const type = q.get("type") || "";
  return TYPES.has(type) ? { tokenHash: q.get("token_hash") || "", type } : { tokenHash: "", type: "" };
}

export default function AuthCallbackScreen() {
  const navigate = useNavigate();
  const [link] = useState(readLink);
  // "confirm" (waiting for the click) | "checking" | "ok" | "failed"
  const [state, setState] = useState(link.tokenHash ? "confirm" : "checking");
  const [busy, setBusy] = useState(false);

  // The old link: Supabase verified it on the way here; read the session.
  // No client, or a request that fails, is "failed" — it was neither, and the
  // page said "מאמתים…" forever (review 5.10, measured 10s and a reload).
  useEffect(() => {
    if (link.tokenHash) return undefined;
    let tid;
    let live = true;
    const check = supabase
      ? supabase.auth.getSession()
      : Promise.reject(new Error("auth is not configured"));
    check.then(({ data }) => {
      if (!live) return;
      if (data?.session) {
        setState("ok");
        tid = setTimeout(() => navigate("/app", { replace: true }), 1200);
      } else {
        setState("failed");
      }
    }).catch(() => { if (live) setState("failed"); });
    return () => { live = false; clearTimeout(tid); };
  }, [link, navigate]);

  const confirm = async () => {
    if (busy) return;
    // The button did nothing at all without a client (review 5.10).
    if (!supabase) { setState("failed"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
      if (error) { setState("failed"); return; }
      setState("ok");
      setTimeout(() => navigate("/app", { replace: true }), 1200);
    } catch {
      setState("failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className={styles.page}>
      <div className={styles.formSide}>
        {/* The way back to the site, as on /login and /signup (review 5.10). */}
        <div className={styles.homeRow}>
          <Link to="/" className={styles.homeLink}>→ חזרה לדף הבית</Link>
        </div>
        <div className={styles.card}>
          <div className={styles.brand}>
            <Logo className={styles.brandLogo} title={COMPANY.name} />
          </div>
          <h1 className={styles.title}>אישור כתובת האימייל</h1>

          {state === "confirm" && (
            <>
              <p className={styles.confirmBody}>עוד לחיצה אחת, והחשבון שלכם מוכן.</p>
              <button type="button" className={styles.submitBtn} onClick={confirm} aria-disabled={busy || undefined}>
                {busy ? "מאשרים…" : "אישור והמשך"}
              </button>
            </>
          )}
          {state === "checking" && <p className={styles.confirmBody} role="status">מאמתים…</p>}
          {state === "ok" && <p className={styles.forgotSuccess} role="status">האימייל אושר ✓ מעבירים אתכם…</p>}
          {state === "failed" && (
            <>
              <div className={styles.noticeWarn} role="status">
                הקישור הזה כבר לא פעיל. אם כבר אישרתם את האימייל — פשוט היכנסו לחשבון.
              </div>
              <Link to="/login" className={styles.submitBtn} style={{ textAlign: "center", textDecoration: "none" }}>
                לכניסה לחשבון
              </Link>
            </>
          )}
          <SupportLine className={styles.help} />
        </div>
      </div>
      <AuthAside />
    </main>
  );
}
