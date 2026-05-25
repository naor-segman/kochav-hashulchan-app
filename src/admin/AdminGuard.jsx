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
// Redirect strategy (no sign-out — preserves customer sessions):
//   no session          → /admin/login
//   non-admin role      → / (customer home; they keep their customer session)
//   DB error on check   → /admin/login with error message
//   admin role          → render children
//
// Status state machine:
//   "loading"  — waiting for session + role check
//   "allowed"  — session valid, role = admin → render children
//   "denied"   — no session → <Navigate to="/admin/login">
//   navigate() — non-admin / DB error → navigate, component unmounts
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

      if (error) {
        // DB error — can't verify role; send to admin login for retry.
        // Do NOT sign out: the session may be valid and the error transient.
        if (!cancelled) {
          navigate("/admin/login", {
            replace: true,
            state: { error: "Access denied: could not verify admin privileges." },
          });
        }
        return;
      }

      if (profile?.role !== "admin") {
        // Authenticated user without admin role (e.g. a regular customer).
        // Redirect to customer home — do NOT sign them out.
        if (!cancelled) navigate("/", { replace: true });
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
