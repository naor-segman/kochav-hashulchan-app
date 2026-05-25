import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../../lib/supabase.js";
import styles from "./AdminLoginScreen.module.css";

// Map raw Supabase auth error strings to user-friendly Hebrew messages.
function friendlyAuthError(message) {
  if (!message) return "אירעה שגיאה לא ידועה.";
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid email or password")) {
    return "אימייל או סיסמה שגויים.";
  }
  if (m.includes("email not confirmed")) {
    return "יש לאשר את כתובת האימייל לפני הכניסה.";
  }
  if (m.includes("too many requests")) {
    return "יותר מדי ניסיונות כניסה. המתן כמה דקות ונסה שוב.";
  }
  if (m.includes("network") || m.includes("fetch failed")) {
    return "שגיאת חיבור. בדוק את חיבור האינטרנט ונסה שוב.";
  }
  return message;
}

export default function AdminLoginScreen() {
  const location  = useLocation();
  const navigate  = useNavigate();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  // Pre-populate error from AdminGuard access-denied redirect (location.state.error).
  const [error,    setError]    = useState(location.state?.error || "");
  const [loading,  setLoading]  = useState(false);

  // Redirect to dashboard if a valid session already exists.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/admin/dashboard", { replace: true });
    });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!supabase) {
      setError("Supabase לא מוגדר. הגדר VITE_SUPABASE_URL ו-VITE_SUPABASE_ANON_KEY בקובץ .env.local");
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (authError) {
      setError(friendlyAuthError(authError.message));
    } else {
      // AdminGuard will do the role check; navigate unconditionally here.
      navigate("/admin/dashboard", { replace: true });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <div className={styles.header}>
          <span className={styles.logo}>✦</span>
          <h1 className={styles.title}>כניסת מנהל</h1>
          <p className={styles.sub}>כוכב השולחן — ניהול מערכת</p>
        </div>

        {!isSupabaseConfigured && (
          <div className={styles.setupBanner}>
            <strong>Supabase לא מוגדר</strong>
            <br />
            העתק את <code>.env.example</code> ל-<code>.env.local</code> ומלא את
            <code>VITE_SUPABASE_URL</code> ו-<code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="admin-email">אימייל</label>
            <input
              id="admin-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              autoComplete="email"
              dir="ltr"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="admin-password">סיסמה</label>
            <input
              id="admin-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              dir="ltr"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.btn} type="submit" disabled={loading || !isSupabaseConfigured}>
            {loading ? "מתחבר…" : "כניסה"}
          </button>
        </form>

        <p className={styles.footer}>
          כניסה לאדמינים בלבד · אין אפשרות הרשמה עצמאית
        </p>

      </div>
    </div>
  );
}
