import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import { getPlanLabel } from "../lib/planConfig.js";
import { useAdminLogout } from "../lib/useAdminLogout.js";
import styles from "./AdminUsersScreen.module.css";
import Loading from "../../components/feedback/Loading.jsx";
import SectionMark from "../../components/ui/SectionMark.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { formatDate } from "../lib/adminFormat.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const USERS_PAGE = 500;

async function loadUsersData() {
  const [profilesRes, eventsRes, totalRes] = await Promise.all([
    supabase
      .from("profiles")
      // subscriptions ordered: without it PostgREST returns the embed in an
      // arbitrary order, so a user with two active rows could show a stale plan
      // here while the customer app showed the current one.
      .select("id, email, full_name, role, created_at, subscriptions(plan, status, started_at)")
      .order("created_at", { ascending: false })
      .order("started_at", { referencedTable: "subscriptions", ascending: false })
      .limit(USERS_PAGE),
    // Ordered and explicitly ranged. An unbounded select is silently capped at
    // PostgREST's max-rows (1000 by default), so past that the per-user counts
    // were computed from an arbitrary subset — a customer with 8 events showed
    // "3", with nothing indicating the number was wrong.
    supabase
      .from("events")
      .select("user_id")
      .order("user_id", { ascending: true })
      .range(0, 99999),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  if (profilesRes.error) throw profilesRes.error;

  // Build event count map (ignore events query errors — count shows 0).
  const eventCounts = {};
  (eventsRes.data || []).forEach(({ user_id }) => {
    eventCounts[user_id] = (eventCounts[user_id] || 0) + 1;
  });

  const rows = (profilesRes.data || []).map((p) => {
    const subs = p.subscriptions || [];
    // Prefer a currently-effective plan (active, then trialing) over an arbitrary
    // historical row PostgREST happened to return first.
    // Same rule usePlan() applies, so support and the customer see one plan.
    const sub  = subs.find((s) => s.status === "active" || s.status === "trialing")
              ?? subs[0];
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

  // The true row count, so the screen can say "500 of 1,240" instead of
  // presenting a truncated window as the whole customer base.
  rows.total = totalRes.count ?? rows.length;
  rows.truncated = rows.length >= USERS_PAGE;
  return rows;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminUsersScreen() {
  const handleLogout = useAdminLogout();

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
      setError(err.message || "טעינת המשתמשים נכשלה.");
      setUsers([]);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);


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
          <Link to="/admin/dashboard" className={styles.backLink} aria-label="חזרה ללוח הבקרה">→</Link>
          <SectionMark name="adminUsers" tone="admin" size={20} className={styles.brandMark} />
          <span className={styles.brandName}>ניהול משתמשים</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>כוכב השולחן</span>
          {/* Was green and unconditional — including with a 500 banner under
              it and zero rows loaded, the one state where it matters. */}
          {!loading && !error && (
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
          {error && (
            <span className={styles.staleBadge}>
              <span className={styles.staleDot} />
              הנתונים לא נטענו
            </span>
          )}
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
            {/* Was "⌕" positioned with `left: 11px` in an RTL interface —
                a fourth icon vocabulary, sitting at the far end of the field
                from where the caret and the typing begin. */}
            <span className={styles.searchIcon}><Icon name="search" size={16} /></span>
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
              {/* Against the TRUE total, not the loaded window. Showing the
                  window as the total made the 501st signup invisible, and made
                  "not found" look like the customer's data was gone. */}
              {users && filtered.length !== (users.total ?? users.length)
                ? ` מתוך ${(users.total ?? users.length).toLocaleString()}`
                : ""
              } משתמשים
              {users?.truncated && (
                <span className={styles.truncNote}> · מוצגים {USERS_PAGE} הראשונים</span>
              )}
            </span>
          )}
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <Loading rows={5} label="טוען משתמשים…" />
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
          <>
          {/* Six columns, 688px of them. At 320 the phone shows two — email and
              name — and תפקיד / תוכנית / אירועים / הצטרף are entirely off the
              side with nothing to say so. Same affordance the events table
              already carries. */}
          <p className={styles.scrollHint}>
            <Icon name="list" size={14} />
            הטבלה רחבה מהמסך — אפשר לגלול אותה לצדדים.
          </p>
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
                    {/* dir="ltr" decides which end the ellipsis eats: in the
                        RTL cell it removed the mailbox name and kept the
                        shared domain. The title keeps the full address. */}
                    <td className={styles.emailCell} dir="ltr" title={user.email}>{user.email}</td>
                    <td className={styles.nameCell} title={user.full_name || undefined}>
                      {user.full_name ?? <span className={styles.muted}>—</span>}
                    </td>
                    <td>
                      <span className={user.role === "admin" ? styles.badgeAdmin : styles.badgeUser}>
                        {user.role === "admin" ? "מנהל" : "משתמש"}
                      </span>
                    </td>
                    <td>
                      <span className={planBadgeClass(user.plan, styles)}>
                        {getPlanLabel(user.plan)}
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
          </>
        )}

      </main>
    </div>
  );
}
