import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import {
  ACTION_META,
  ACTION_KEYS,
  ENTITY_TYPE_LABELS,
  getActionLabel,
  getActionIcon,
  getEntityLabel,
} from "../lib/activityConfig.js";
import styles from "./AdminActivityScreen.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function metaSummary(meta) {
  if (!meta || typeof meta !== "object") return "—";
  const entries = Object.entries(meta).slice(0, 3);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${v}`).join(", ");
}

async function loadActivityData() {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, action, entity_type, entity_id, entity_name, metadata, created_at, profiles!actor_id(email)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    actorEmail: row.profiles?.email || "—",
  }));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminActivityScreen() {
  const navigate = useNavigate();

  const [adminEmail,    setAdminEmail]    = useState(null);
  const [logs,          setLogs]          = useState(null);   // null = loading
  const [error,         setError]         = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);  // table missing

  // Filters
  const [filterAction, setFilterAction] = useState("all");
  const [search,       setSearch]       = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  const loadLogs = useCallback(async () => {
    if (!supabase) return;
    setLogs(null);
    setError(null);
    setNotConfigured(false);

    try {
      setLogs(await loadActivityData());
    } catch (err) {
      if (err.code === "42P01") {
        setNotConfigured(true);
        setLogs([]);
      } else {
        setError(err.message || "Failed to load activity logs.");
        setLogs([]);
      }
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = (logs || []).filter(row => {
    if (filterAction !== "all" && row.action !== filterAction) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !row.actorEmail.toLowerCase().includes(q) &&
        !(row.entity_name || "").toLowerCase().includes(q) &&
        !(row.entity_id   || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const loading = logs === null;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link to="/admin/dashboard" className={styles.backLink}>←</Link>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>יומן פעילות</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>כוכב השולחן</span>
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
            <button className={styles.retryInlineBtn} onClick={loadLogs}>נסה שוב</button>
          </div>
        )}

        {/* ── Table not yet created ── */}
        {!loading && notConfigured && (
          <div className={styles.setupBox}>
            <div className={styles.setupIcon}>📋</div>
            <h2 className={styles.setupTitle}>יומן הפעילות לא מוגדר עדיין</h2>
            <p className={styles.setupText}>
              טבלת <code className={styles.inlineCode}>activity_logs</code> לא נמצאה ב-Supabase.
              הפעל את מיגרציית יומן הפעילות כדי להתחיל לאסוף נתונים.
            </p>
            <p className={styles.setupHint}>
              כאשר הטבלה תיווצר, יוצגו כאן פעולות כגון יצירת משתמשים, מחיקת אירועים, שינויי מנויים וכניסות מנהל.
            </p>
            <div className={styles.actionTypeGrid}>
              {ACTION_KEYS.map(key => {
                const meta = ACTION_META[key];
                return (
                  <div key={key} className={styles.actionTypePill}>
                    <span className={styles.actionTypeIcon}>{meta.icon}</span>
                    <span className={styles.actionTypeLabel}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
            <button className={styles.retryBtn} onClick={loadLogs}>
              נסה שוב
            </button>
          </div>
        )}

        {/* ── Filters + table ── */}
        {!loading && !notConfigured && !error && (
          <>
            {/* Toolbar */}
            <div className={styles.toolbar}>
              <div className={styles.filters}>
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder="חיפוש לפי אימייל, ישות…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  dir="ltr"
                />
                <select
                  className={styles.filterSelect}
                  value={filterAction}
                  onChange={e => setFilterAction(e.target.value)}
                >
                  <option value="all">כל הפעולות</option>
                  {ACTION_KEYS.map(k => (
                    <option key={k} value={k}>{ACTION_META[k].icon} {ACTION_META[k].label}</option>
                  ))}
                </select>
              </div>
              <span className={styles.resultCount}>{filtered.length.toLocaleString()} רשומות</span>
            </div>

            {/* Empty — no logs yet */}
            {(logs || []).length === 0 && (
              <div className={styles.stateBox}>
                <div className={styles.emptyIcon}>📋</div>
                <p className={styles.emptyTitle}>אין פעילות עדיין</p>
                <p className={styles.emptyHint}>
                  פעולות מערכת יירשמו כאן ברגע שיוגדר מנגנון הרישום.
                </p>
              </div>
            )}

            {/* Empty — filter produced nothing */}
            {(logs || []).length > 0 && filtered.length === 0 && (
              <div className={styles.stateBox}>
                <p className={styles.emptyTitle}>אין תוצאות לסינון הנוכחי</p>
                <p className={styles.emptyHint}>שנה את הסינון כדי לראות רשומות.</p>
              </div>
            )}

            {/* Log table */}
            {filtered.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>זמן</th>
                      <th>פעולה</th>
                      <th>שחקן</th>
                      <th>סוג ישות</th>
                      <th>שם / מזהה</th>
                      <th>מטא</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(row => {
                      const meta = ACTION_META[row.action];
                      return (
                        <tr key={row.id} className={styles.dataRow}>
                          <td className={styles.dateCell}>{formatDateTime(row.created_at)}</td>
                          <td>
                            <span
                              className={styles.actionBadge}
                              style={{ color: meta?.color ?? "#374151" }}
                            >
                              {meta?.icon ?? "•"} {getActionLabel(row.action)}
                            </span>
                          </td>
                          <td className={styles.emailCell}>{row.actorEmail}</td>
                          <td className={styles.entityCell}>{getEntityLabel(row.entity_type)}</td>
                          <td className={styles.nameCell}>
                            {row.entity_name || row.entity_id || <span className={styles.muted}>—</span>}
                          </td>
                          <td className={styles.metaCell}>{metaSummary(row.metadata)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className={styles.stateBox}>
            <span className={styles.loadingText}>טוען יומן פעילות…</span>
          </div>
        )}

      </main>
    </div>
  );
}
