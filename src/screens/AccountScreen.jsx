import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { supabase } from "../lib/supabase.js";
import { getPlanLabel, getStatusLabel, PLAN_META, STATUS_META } from "../admin/lib/planConfig.js";
import styles from "./AccountScreen.module.css";

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

async function fetchSubscription(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, started_at, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

export default function AccountScreen() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [sub,      setSub]      = useState(undefined); // undefined=loading, null=none
  const [signingOut, setSigningOut] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true, state: { from: "/account" } });
    }
  }, [loading, user, navigate]);

  // Fetch subscription once we have a user
  useEffect(() => {
    if (!user) return;
    fetchSubscription(user.id).then(setSub);
  }, [user]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading || !user) return null;

  const planKey   = sub?.plan   || "free";
  const statusKey = sub?.status || "active";
  const planMeta  = PLAN_META[planKey];
  const statusMeta = STATUS_META[statusKey];

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Brand */}
        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>כוכב השולחן</span>
        </div>

        <h1 className={styles.title}>החשבון שלי</h1>

        {/* User info */}
        <section className={styles.section}>
          <h2 className={styles.sectionLabel}>פרטי חשבון</h2>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>אימייל</span>
            <span className={styles.infoVal} dir="ltr">{user.email}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>מזהה משתמש</span>
            <span className={styles.infoVal} dir="ltr" style={{ fontSize: 11, color: "var(--muted)" }}>
              {user.id.slice(0, 8)}…
            </span>
          </div>
        </section>

        {/* Subscription */}
        <section className={styles.section}>
          <h2 className={styles.sectionLabel}>תוכנית ומנוי</h2>
          {sub === undefined ? (
            <p className={styles.loadingText}>טוען…</p>
          ) : (
            <>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>תוכנית</span>
                <span
                  className={styles.badge}
                  style={{
                    color:       planMeta?.color       || "#888",
                    background:  planMeta?.bgColor     || "#f4f4f5",
                    borderColor: planMeta?.borderColor || "#e5e7eb",
                  }}
                >
                  {getPlanLabel(planKey)}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>סטטוס</span>
                <span
                  className={styles.badge}
                  style={{
                    color:       statusMeta?.color       || "#888",
                    background:  statusMeta?.bgColor     || "#f4f4f5",
                    borderColor: statusMeta?.borderColor || "#e5e7eb",
                  }}
                >
                  {getStatusLabel(statusKey)}
                </span>
              </div>
              {sub?.started_at && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>תחילת מנוי</span>
                  <span className={styles.infoVal}>{formatDate(sub.started_at)}</span>
                </div>
              )}
              {sub?.expires_at && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>פג תוקף</span>
                  <span className={styles.infoVal}>{formatDate(sub.expires_at)}</span>
                </div>
              )}
              {!sub && (
                <p className={styles.noSubNote}>
                  אין מנוי פעיל — משתמש בתוכנית החינמית.
                </p>
              )}
            </>
          )}
        </section>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.signOutBtn}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? "מתנתק…" : "התנתקות"}
          </button>
        </div>

        <Link to="/" className={styles.backLink}>← חזרה לאפליקציה</Link>

      </div>
    </div>
  );
}
