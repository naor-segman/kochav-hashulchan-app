import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import styles from "./AdminUsersScreen.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function planBadgeClass(plan, s) {
  return { free: s.planFree, pro: s.planPro, enterprise: s.planEnterprise }[plan] ?? s.planFree;
}

// ── Data fetching ─────────────────────────────────────────────────────────────
//
// Two queries in parallel:
//   profiles   — id, email, full_name, role, created_at + nested subscriptions
//   events     — just user_id (to count per user client-side)
//
// Subscriptions are embedded via FK relationship; we take the first active one,
// falling back to any subscription, then to plan='free'.

async function loadUsersData() {
  const [profilesRes, eventsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, created_at, subscriptions(plan, status)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("events")
      .select("user_id"),
  ]);

  if (profilesRes.error) throw profilesRes.error;

  // Build event count map (ignore events query errors — count shows 0).
  const eventCounts = {};
  (eventsRes.data || []).forEach(({ user_id }) => {
    eventCounts[user_id] = (eventCounts[user_id] || 0) + 1;
  });

  return (profilesRes.data || []).map((p) => {
    const subs = p.subscriptions || [];
    const sub  = subs.find((s) => s.status === "active") ?? subs[0];
    return {
      id:          p.id,
      email:       p.email,
      full_name:   p.full_name || null,
      role:        p.role,
      plan:        sub?.plan || "free",
      created_at:  p.created_at,
      event_count: eventCounts[p.id] || 0,
    };
  });
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminUsersScreen() {
  const navigate = useNavigate();

  const [adminEmail, setAdminEmail] = useState(null);
  const [users,      setUsers]      = useState(null);   // null = loading
  const [error,      setError]      = useState(null);
  const [search,     setSearch]     = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  const loadUsers = useCallback(async () => {
    if (!supabase) return;
    setUsers(null);
    setError(null);
    try {
      setUsers(await loadUsersData());
    } catch (err) {
      setError(err.message || "Failed to load users.");
      setUsers([]);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  // Client-side search — fast enough for admin datasets.
  const filtered = useMemo(() => {
    if (!users) return [];
    if (!search.trim()) return users;
    const q = search.trim().toLowerCase();
    return users.filter((u) =>
      u.email.toLowerCase().includes(q) ||
      (u.full_name || "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const loading = users === null;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link to="/admin/dashboard" className={styles.backLink}>←</Link>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>ניהול משתמשים</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>כוכב השולחן</span>
          <span className={styles.liveBadge}>
            <span className={styles.liveDot} />
            נתונים חיים
          </span>
        </div>
        <div className={styles.topbarRight}>
          {adminEmail && <span className={styles.adminEmail}>{adminEmail}</span>}
          <button className={styles.logoutBtn} onClick={handleLogout}>יציאה</button>
        </div>
      </header>

      <main className={styles.main}>

        {/* ── Error banner ── */}
        {error && (
          <div className={styles.errorBanner}>
            {error}
            <button className={styles.retryBtn} onClick={loadUsers}>נסה שוב</button>
          </div>
        )}

        {/* ── Toolbar: search + count ── */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="חיפוש לפי אימייל או שם…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              dir="auto"
            />
          </div>
          {!loading && !error && (
            <span className={styles.resultCount}>
              {filtered.length.toLocaleString()}
              {users && filtered.length !== users.length
                ? ` מתוך ${users.length.toLocaleString()}`
                : ""
              } משתמשים
            </span>
          )}
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className={styles.stateBox}>
            <span className={styles.loadingText}>טוען משתמשים…</span>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && filtered.length === 0 && (
          <div className={styles.stateBox}>
            {search.trim()
              ? <><p className={styles.emptyTitle}>לא נמצאו תוצאות</p><p className={styles.emptyHint}>נסה לחפש מונח אחר</p></>
              : <><p className={styles.emptyTitle}>אין משתמשים עדיין</p><p className={styles.emptyHint}>משתמשים יופיעו כאן לאחר הרשמה ראשונה</p></>
            }
          </div>
        )}

        {/* ── Users table ── */}
        {!loading && !error && filtered.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>אימייל</th>
                  <th>שם</th>
                  <th>תפקיד</th>
                  <th>תוכנית</th>
                  <th className={styles.numCol}>אירועים</th>
                  <th>הצטרף</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td className={styles.emailCell}>{user.email}</td>
                    <td className={styles.nameCell}>
                      {user.full_name ?? <span className={styles.muted}>—</span>}
                    </td>
                    <td>
                      <span className={user.role === "admin" ? styles.badgeAdmin : styles.badgeUser}>
                        {user.role}
                      </span>
                    </td>
                    <td>
                      <span className={planBadgeClass(user.plan, styles)}>
                        {user.plan}
                      </span>
                    </td>
                    <td className={styles.numCell}>
                      {user.event_count > 0
                        ? (
                          <Link
                            to={`/admin/events?owner=${encodeURIComponent(user.email)}`}
                            className={styles.eventsLink}
                            title="צפה באירועים של משתמש זה"
                          >
                            {user.event_count}
                          </Link>
                        )
                        : user.event_count
                      }
                    </td>
                    <td className={styles.dateCell}>{formatDate(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </main>
    </div>
  );
}
