import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import styles from "./AdminDashboardScreen.module.css";

// Stat tile definitions — key maps to the stats object returned by fetchStats().
const STAT_DEFS = [
  { icon: "👥", label: "משתמשים",       key: "users" },
  { icon: "📅", label: "אירועים",       key: "events" },
  { icon: "📋", label: "תבניות",        key: "templates" },
  { icon: "💳", label: "מנויים פעילים", key: "subscriptions" },
];

// Nav links for future admin screens (not yet built).
const NAV_ITEMS = [
  { icon: "👥", label: "ניהול משתמשים",   path: "/admin/users",         phase: "3" },
  { icon: "📅", label: "כל האירועים",     path: "/admin/events",        phase: "3" },
  { icon: "📋", label: "ניהול תבניות",    path: "/admin/templates",     phase: "3" },
  { icon: "💳", label: "מנויים ותשלומים", path: "/admin/subscriptions", phase: "4" },
];

// Run all four count queries in parallel.
// Returns { users, events, templates, subscriptions } — null means query failed.
async function fetchStats() {
  const [usersRes, eventsRes, templatesRes, subsRes] = await Promise.all([
    supabase.from("profiles")
      .select("*", { count: "exact", head: true }),
    supabase.from("events")
      .select("*", { count: "exact", head: true }),
    supabase.from("templates")
      .select("*", { count: "exact", head: true }),
    supabase.from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  return {
    users:         usersRes.error     ? null : (usersRes.count     ?? 0),
    events:        eventsRes.error    ? null : (eventsRes.count    ?? 0),
    templates:     templatesRes.error ? null : (templatesRes.count ?? 0),
    subscriptions: subsRes.error      ? null : (subsRes.count      ?? 0),
  };
}

export default function AdminDashboardScreen() {
  const navigate = useNavigate();

  const [adminEmail,  setAdminEmail]  = useState(null);
  const [stats,       setStats]       = useState(null);   // null = loading
  const [statsError,  setStatsError]  = useState(null);

  // Fetch logged-in user email for the top bar.
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  // Load stats — re-callable for manual refresh.
  const loadStats = useCallback(async () => {
    if (!supabase) return;
    setStats(null);       // back to loading
    setStatsError(null);

    try {
      const result = await fetchStats();
      setStats(result);
      // If every value is null all queries failed — show a global error.
      const allFailed = Object.values(result).every(v => v === null);
      if (allFailed) setStatsError("Could not load stats. Check your Supabase connection.");
    } catch {
      setStatsError("Unexpected error loading stats.");
      setStats({ users: null, events: null, templates: null, subscriptions: null });
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  const loading = stats === null;

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

        {/* ── Stats error banner ── */}
        {statsError && (
          <div className={styles.statsError}>
            {statsError}
            <button className={styles.retryBtn} onClick={loadStats}>נסה שוב</button>
          </div>
        )}

        {/* ── Stats grid ── */}
        <section>
          <h2 className={styles.sectionTitle}>סטטיסטיקות</h2>
          <div className={styles.statsGrid}>
            {STAT_DEFS.map(({ icon, label, key }) => {
              const value = stats?.[key];
              return (
                <div key={key} className={styles.statCard}>
                  <span className={styles.statIcon}>{icon}</span>
                  <span className={loading ? styles.statValueLoading : styles.statValue}>
                    {loading ? "…" : (value === null ? "—" : value.toLocaleString())}
                  </span>
                  <span className={styles.statLabel}>{label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Navigation links ── */}
        <section>
          <h2 className={styles.sectionTitle}>ניהול</h2>
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item) => (
              <li key={item.path} className={styles.navItem}>
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
