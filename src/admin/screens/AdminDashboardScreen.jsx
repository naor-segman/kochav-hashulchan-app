import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import styles from "./AdminDashboardScreen.module.css";
import SectionMark from "../../components/ui/SectionMark.jsx";
import Icon from "../../components/ui/Icon.jsx";

// Stat tile definitions — key maps to the stats object returned by fetchStats().
// `mark` is a key into components/ui/SectionMark — the same drawings the
// customer app uses, rendered in the panel's neutral tone. Six identical
// magenta outlines used to sit in a column here; the panel is an internal tool
// and does not get to spend the brand accent six times on one screen.
const STAT_DEFS = [
  { mark: "adminUsers",         label: "משתמשים",       key: "users" },
  { mark: "adminEvents",        label: "אירועים",       key: "events" },
  { mark: "adminTemplates",     label: "תבניות",        key: "templates" },
  { mark: "adminSubscriptions", label: "מנויים פעילים", key: "subscriptions" },
];

// live: true  → rendered as a real Link (route exists)
// phase: "N"  → rendered as a static item with a phase badge (not built yet)
const NAV_ITEMS = [
  { mark: "adminUsers",         label: "ניהול משתמשים",   path: "/admin/users",         live: true },
  { mark: "adminEvents",        label: "כל האירועים",     path: "/admin/events",        live: true },
  { mark: "adminTemplates",     label: "ניהול תבניות",    path: "/admin/templates",     live: true },
  { mark: "adminSubscriptions", label: "מנויים ותשלומים", path: "/admin/subscriptions", live: true },
  { mark: "adminActivity",      label: "יומן פעילות",     path: "/admin/activity",      live: true },
  { mark: "alert",              label: "שגיאות",          path: "/admin/errors",        live: true },
  { mark: "adminSettings",      label: "הגדרות מערכת",   path: "/admin/settings",      live: true },
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
      .in("status", ["active", "trialing"]),
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

  const [adminEmail,    setAdminEmail]    = useState(null);
  const [stats,         setStats]         = useState(null);   // null = loading
  const [statsError,    setStatsError]    = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

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
      setLastRefreshed(new Date());
      // If every value is null all queries failed — show a global error.
      const allFailed = Object.values(result).every(v => v === null);
      if (allFailed) setStatsError("לא ניתן לטעון נתונים. בדוק את חיבור Supabase שלך.");
    } catch {
      setStatsError("שגיאה בלתי צפויה בטעינת הנתונים.");
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
          <SectionMark name="adminOverview" tone="admin" size={20} className={styles.brandMark} />
          <span className={styles.brandName}>לוח בקרה</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>כוכב השולחן</span>
          {/* Was green and unconditional — it stayed green with a red error
              banner underneath and every tile showing "—". */}
          {!loading && !statsError && (
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} />
              נתונים חיים
            </span>
          )}
          {loading && (
            <span className={styles.loadBadge}>
              <span className={styles.loadDot} />
              טוען נתונים
            </span>
          )}
          {!loading && statsError && (
            <span className={styles.staleBadge}>
              <span className={styles.staleDot} />
              הנתונים לא נטענו
            </span>
          )}
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
            {/* The banner had no action on it at all, which is why .retryBtn
                sat unused in the stylesheet. */}
            <button className={styles.retryBtn} onClick={loadStats}>נסה שוב</button>
          </div>
        )}

        {/* ── Stats grid ── */}
        <section>
          <div className={styles.statsSectionRow}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>סטטיסטיקות</h2>
            {/* Was the literal U+21BB. In the Heebo stack it draws as a shape
                indistinguishable from the Hebrew letter ט, so the button read
                "ט רענן". It was also a fourth icon vocabulary alongside
                SectionMark, Icon and TableGlyph. */}
            <button className={styles.refreshBtn} onClick={loadStats} disabled={loading}>
              <Icon name="refresh" size={14} />
              {loading ? "טוען…" : "רענן"}
            </button>
            {lastRefreshed && (
              <span className={styles.lastRefreshed}>
                עודכן: {lastRefreshed.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <div className={styles.statsGrid}>
            {STAT_DEFS.map(({ mark, label, key }) => {
              const value = stats?.[key];
              return (
                <div key={key} className={styles.statCard}>
                  <span className={styles.statIcon}><SectionMark name={mark} tone="admin" size={24} /></span>
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
            {NAV_ITEMS.map((item) =>
              item.live ? (
                <li key={item.path}>
                  <Link to={item.path} className={styles.navItemLink}>
                    <span className={styles.navIcon}><SectionMark name={item.mark} tone="admin" size={22} /></span>
                    <span className={styles.navLabel}>{item.label}</span>
                    <span className={styles.navArrow}>←</span>
                  </Link>
                </li>
              ) : (
                <li key={item.path} className={styles.navItem}>
                  <span className={styles.navIcon}><SectionMark name={item.mark} tone="admin" size={22} /></span>
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navPhase}>Phase {item.phase}</span>
                </li>
              )
            )}
          </ul>
        </section>

      </main>
    </div>
  );
}
