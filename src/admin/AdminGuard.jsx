import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import styles from "./AdminGuard.module.css";

// ── AdminGuard ────────────────────────────────────────────────────────────────
//
// Wraps any admin-only route. Three states:
//   loading  — waiting for Supabase session check
//   no session — redirect to /admin/login
//   session  — render children
//
// Phase 1: any authenticated Supabase user can access admin because we only
// create admin accounts manually — no self-registration exists.
//
// TODO(admin-phase2): add role check:
//   const { data } = await supabase.from("profiles").select("role").single();
//   if (data?.role !== "admin") redirect to "/" with error toast.
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminGuard({ children }) {
  // undefined = still checking, null = no session, object = active session
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!supabase) {
      // No Supabase credentials configured — treat as unauthenticated.
      setSession(null);
      return;
    }

    // Read current session immediately (synchronous from memory cache).
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    // Keep in sync with auth state changes (login/logout in other tabs, expiry).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className={styles.loading}><span>טוען…</span></div>;
  }

  if (!session) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
