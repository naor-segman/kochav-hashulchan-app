import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import Icon from "../../components/ui/Icon.jsx";
import {
  ACTION_META,
  ACTION_KEYS,
  UNKNOWN_ACTION_ICON,
  getActionLabel,
  isKnownAction,
  getEntityLabel,
  isKnownEntity,
  metaSummary,
  metaFull,
} from "../lib/activityConfig.js";
import { getPlanLabel } from "../lib/planConfig.js";
import { useAdminLogout } from "../lib/useAdminLogout.js";
import { formatDateTime } from "../lib/adminFormat.js";
import styles from "./AdminActivityScreen.module.css";
import Loading from "../../components/feedback/Loading.jsx";
import SectionMark from "../../components/ui/SectionMark.jsx";

// ── Helpers ───────────────────────────────────────────────────────────────────
//
// formatDateTime / metaSummary moved to admin/lib — see adminFormat.js and
// activityConfig.js for what was wrong with them.

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
  const handleLogout = useAdminLogout();

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
      if ((err.code === "42P01" || err.code === "PGRST205")) {
        setNotConfigured(true);
        setLogs([]);
      } else {
        setError(err.message || "טעינת יומן הפעילות נכשלה.");
        setLogs([]);
      }
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);


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
          <Link to="/admin/dashboard" className={styles.backLink} aria-label="חזרה ללוח הבקרה">→</Link>
          <SectionMark name="adminActivity" tone="admin" size={20} className={styles.brandMark} />
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
            <div className={styles.setupIcon}><Icon name="bell" size={30} /></div>
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
                    <span className={styles.actionTypeIcon}><Icon name={meta.icon} size={16} /></span>
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
                    <option key={k} value={k}>{ACTION_META[k].label}</option>
                  ))}
                </select>
              </div>
              <span className={styles.resultCount}>{filtered.length.toLocaleString()} רשומות</span>
            </div>

            {/* Empty — no logs yet */}
            {(logs || []).length === 0 && (
              <div className={styles.stateBox}>
                <div className={styles.emptyIcon}><Icon name="bell" size={28} /></div>
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
              <>
              {/* The widest table in the panel: 815px. At 320 the phone shows
                  זמן and פעולה, cuts שחקן mid-address, and hides סוג ישות /
                  שם / מטא entirely. */}
              <p className={styles.scrollHint}>
                <Icon name="list" size={14} />
                הטבלה רחבה מהמסך — אפשר לגלול אותה לצדדים.
              </p>
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
                      const meta    = ACTION_META[row.action];
                      const known   = isKnownAction(row.action);
                      const summary = metaSummary(row.metadata, getPlanLabel);
                      return (
                        <tr key={row.id} className={styles.dataRow}>
                          {/* "29.07.2026, 14:32" rendered as "14:32 ,29.07.2026"
                              on every row: no strong LTR character, so bidi
                              rule N1 resolved the neutrals around the comma as
                              RTL and put the time first with the comma
                              orphaned. dir="ltr" isolates the run. */}
                          <td className={styles.dateCell}>
                            <span dir="ltr">{formatDateTime(row.created_at)}</span>
                          </td>
                          <td>
                            {/* The hue on this badge was a second encoding of
                                the label right next to it — six saturated
                                colours in one column of a monochrome panel.
                                The icon is the scannable distinction. An
                                action with no mapping used to render its raw
                                key in bold black with no glyph at all; it now
                                renders as what it is, a raw identifier. */}
                            <span className={known ? styles.actionBadge : styles.actionBadgeRaw}>
                              <Icon name={(meta?.icon) || UNKNOWN_ACTION_ICON} size={15} />
                              {known
                                ? getActionLabel(row.action)
                                : <code className={styles.rawKey} dir="ltr" title={row.action}>{row.action}</code>
                              }
                            </span>
                          </td>
                          <td className={styles.emailCell} title={row.actorEmail}>{row.actorEmail}</td>
                          <td className={styles.entityCell}>
                            {isKnownEntity(row.entity_type)
                              ? getEntityLabel(row.entity_type)
                              : <code className={styles.rawKey} dir="ltr" title={row.entity_type || ""}>{row.entity_type || "—"}</code>
                            }
                          </td>
                          <td className={styles.nameCell} title={row.entity_name || row.entity_id || ""}>
                            {row.entity_name || row.entity_id || <span className={styles.muted}>—</span>}
                          </td>
                          {/* The JSONB used to be serialised verbatim:
                              `amount_cents: 24900`, English keys, truncated
                              mid-word at 200px with no way to see the rest. */}
                          <td className={styles.metaCell} title={metaFull(row.metadata, getPlanLabel)}>
                            {summary}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </>
        )}

        {/* ── Loading ── */}
        {loading && (
          <Loading rows={5} label="טוען יומן פעילות…" />
        )}

      </main>
    </div>
  );
}
