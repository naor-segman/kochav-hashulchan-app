import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import styles from "./AdminGuard.module.css";

// ── AdminGuard ────────────────────────────────────────────────────────────────
//
// Two-step access check on every protected admin route:
//   1. Is there an active Supabase session?
//   2. Does profiles.role === 'admin' for that user?
//
// Any failure (no session, non-admin role, DB error) signs the user out and
// redirects to /admin/login. Non-admin redirects carry an error message via
// React Router location state so AdminLoginScreen can display it.
//
// Status state machine:
//   "loading"  — waiting for session + role check
//   "allowed"  — session valid, role = admin → render children
//   "denied"   — no session → <Navigate> (no error msg needed, just redirect)
//   navigate() — non-admin role → navigate with error state, component unmounts
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminGuard({ children }) {
  const [status, setStatus] = useState("loading");
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) {
      setStatus("denied");
      return;
    }

    let cancelled = false;

    async function checkAccess() {
      // Step 1: session
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        setStatus("denied");
        return;
      }

      // Step 2: admin role from profiles table
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (cancelled) return;

      if (error || profile?.role !== "admin") {
        await supabase.auth.signOut();
        if (!cancelled) {
          navigate("/admin/login", {
            replace: true,
            state: { error: "Access denied: your account does not have admin privileges." },
          });
        }
        return;
      }

      setStatus("allowed");
    }

    checkAccess();

    // React to SIGNED_OUT fired from another tab or token expiry.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") setStatus("denied");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (status === "loading") {
    return <div className={styles.loading}><span>טוען…</span></div>;
  }

  if (status === "denied") {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
}
