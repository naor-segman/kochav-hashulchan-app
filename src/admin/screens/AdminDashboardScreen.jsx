import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import styles from "./AdminDashboardScreen.module.css";

// ── Stat tiles ────────────────────────────────────────────────────────────────
// Phase 1: placeholder values — database schema not yet deployed.
// TODO(admin-phase2): replace with live Supabase queries once profiles + events
// tables exist:
//   const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });
// ─────────────────────────────────────────────────────────────────────────────

const STAT_TILES = [
  { icon: "👥", label: "משתמשים",       value: "—", phase: "2" },
  { icon: "📅", label: "אירועים",       value: "—", phase: "2" },
  { icon: "🆕", label: "הצטרפו היום",   value: "—", phase: "2" },
  { icon: "💳", label: "תוכניות פעילות", value: "—", phase: "3" },
];

// ── Future nav links ──────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: "👥", label: "ניהול משתמשים",  path: "/admin/users",         phase: "2" },
  { icon: "📅", label: "כל האירועים",    path: "/admin/events",        phase: "2" },
  { icon: "📋", label: "ניהול תבניות",   path: "/admin/templates",     phase: "3" },
  { icon: "💳", label: "מנויים ותשלומים", path: "/admin/subscriptions", phase: "3" },
];

export default function AdminDashboardScreen() {
  const [adminEmail, setAdminEmail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>Admin Panel</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>כוכב השולחן</span>
        </div>
        <div className={styles.topbarRight}>
          {adminEmail && <span className={styles.adminEmail}>{adminEmail}</span>}
          <button className={styles.logoutBtn} onClick={handleLogout}>
            יציאה
          </button>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── Phase notice ── */}
        <div className={styles.phaseNotice}>
          <strong>Phase 1 — Admin Foundation</strong>
          {" "}Authentication is active. Stat tiles and navigation links will become
          functional in Phase 2 once the database schema is deployed to Supabase.
        </div>

        {/* ── Stats grid ── */}
        <section>
          <h2 className={styles.sectionTitle}>סטטיסטיקות</h2>
          <div className={styles.statsGrid}>
            {STAT_TILES.map((t, i) => (
              <div key={i} className={styles.statCard}>
                <span className={styles.statIcon}>{t.icon}</span>
                <span className={styles.statValue}>{t.value}</span>
                <span className={styles.statLabel}>{t.label}</span>
                <span className={styles.statPhase}>Phase {t.phase}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Navigation links ── */}
        <section>
          <h2 className={styles.sectionTitle}>ניהול</h2>
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item, i) => (
              <li key={i} className={styles.navItem}>
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                <span className={styles.navPhase}>Phase {item.phase}</span>
              </li>
            ))}
          </ul>
        </section>

      </main>
    </div>
  );
}
