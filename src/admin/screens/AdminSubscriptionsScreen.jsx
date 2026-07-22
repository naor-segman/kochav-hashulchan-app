import { useState, useEffect, useCallback, Fragment } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import {
  PLAN_META,
  STATUS_META,
  getPlanLabel,
  getStatusLabel,
  getPlanLimits,
  PLAN_KEYS,
  STATUS_KEYS,
} from "../lib/planConfig.js";
import Icon from "../../components/ui/Icon.jsx";
import styles from "./AdminSubscriptionsScreen.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

async function loadSubscriptionsData() {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan, status, started_at, expires_at, created_at, updated_at, profiles!user_id(email)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data || []).map(row => ({
    ...row,
    email: row.profiles?.email || "—",
  }));
}

// ── Badge components ──────────────────────────────────────────────────────────

function PlanBadge({ plan }) {
  const meta = PLAN_META[plan];
  if (!meta) return <span className={styles.badgeMuted}>{plan || "—"}</span>;
  return (
    <span
      className={styles.badge}
      style={{ color: meta.color, background: meta.bgColor, borderColor: meta.borderColor }}
    >
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status];
  if (!meta) return <span className={styles.badgeMuted}>{status || "—"}</span>;
  return (
    <span
      className={styles.badge}
      style={{ color: meta.color, background: meta.bgColor, borderColor: meta.borderColor }}
    >
      {meta.label}
    </span>
  );
}

// ── Plan limits tooltip panel ─────────────────────────────────────────────────

function PlanLimitsPanel({ plan }) {
  const limits = getPlanLimits(plan);
  const rows = [
    { label: "אירועים מקס׳",    value: limits.maxEvents   === Infinity ? "ללא הגבלה" : limits.maxEvents },
    { label: "אורחים מקס׳",     value: limits.maxGuests   === Infinity ? "ללא הגבלה" : limits.maxGuests },
    { label: "ייצוא מתקדם",     value: limits.advancedExports ? "✓" : "—" },
    { label: "תכונות AI",       value: limits.aiFeatures  ? "✓" : "—" },
    { label: "שיתוף פעולה",     value: limits.collaboration ? "✓" : "—" },
  ];
  return (
    <table className={styles.limitsTable}>
      <tbody>
        {rows.map(({ label, value }) => (
          <tr key={label}>
            <td className={styles.limitsLabel}>{label}</td>
            <td className={styles.limitsValue}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminSubscriptionsScreen() {
  const navigate = useNavigate();

  const [adminEmail,     setAdminEmail]     = useState(null);
  const [subs,           setSubs]           = useState(null);   // null = loading
  const [error,          setError]          = useState(null);
  const [notConfigured,  setNotConfigured]  = useState(false);

  // Filter state
  const [filterPlan,   setFilterPlan]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search,       setSearch]       = useState("");

  // Expanded plan-limits row
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  const loadSubs = useCallback(async () => {
    if (!supabase) return;
    setSubs(null);
    setError(null);
    setNotConfigured(false);

    try {
      setSubs(await loadSubscriptionsData());
    } catch (err) {
      if (err.code === "42P01") {
        setNotConfigured(true);
        setSubs([]);
      } else {
        setError(err.message || "טעינת המנויים נכשלה.");
        setSubs([]);
      }
    }
  }, []);

  useEffect(() => { loadSubs(); }, [loadSubs]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  // ── Derived filtered list ──────────────────────────────────────────────────

  const filtered = (subs || []).filter(s => {
    if (filterPlan   !== "all" && s.plan   !== filterPlan)   return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const loading = subs === null;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link to="/admin/dashboard" className={styles.backLink}>←</Link>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>מנויים ותשלומים</span>
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
            <button className={styles.retryInlineBtn} onClick={loadSubs}>נסה שוב</button>
          </div>
        )}

        {/* ── Table missing ── */}
        {!loading && notConfigured && (
          <div className={styles.notConfiguredBox}>
            <div className={styles.notConfiguredIcon}><Icon name="card" size={30} /></div>
            <h2 className={styles.notConfiguredTitle}>טבלת מנויים לא נמצאה</h2>
            <p className={styles.notConfiguredText}>
              הפעל את המיגרציה הבאה ב-Supabase SQL Editor:
            </p>
            <code className={styles.migrationName}>
              supabase/migrations/20260524000000_admin_foundation.sql
            </code>
            <button className={styles.retryBtn} onClick={loadSubs}>
              נסה שוב לאחר הפעלת המיגרציה
            </button>
          </div>
        )}

        {/* ── Plan reference card ── */}
        {!loading && !notConfigured && !error && (
          <section className={styles.planRefSection}>
            <h2 className={styles.sectionTitle}>סקירת תוכניות</h2>
            <div className={styles.planCards}>
              {PLAN_KEYS.map(plan => {
                const meta   = PLAN_META[plan];
                const limits = getPlanLimits(plan);
                return (
                  <div key={plan} className={styles.planCard} style={{ borderTopColor: meta.color }}>
                    <div className={styles.planCardHeader}>
                      <span className={styles.planCardLabel} style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                      <span className={styles.planCardSub}>{meta.labelEn}</span>
                    </div>
                    <ul className={styles.planCardList}>
                      <li>{limits.maxEvents === Infinity ? "ללא הגבלת אירועים" : `עד ${limits.maxEvents} אירועים`}</li>
                      <li>{limits.maxGuests  === Infinity ? "ללא הגבלת אורחים"  : `עד ${limits.maxGuests} אורחים`}</li>
                      <li className={!limits.advancedExports ? styles.featureOff : ""}>
                        {limits.advancedExports ? "✓" : "—"} ייצוא מתקדם
                      </li>
                      <li className={!limits.aiFeatures ? styles.featureOff : ""}>
                        {limits.aiFeatures ? "✓" : "—"} תכונות AI
                      </li>
                      <li className={!limits.collaboration ? styles.featureOff : ""}>
                        {limits.collaboration ? "✓" : "—"} שיתוף פעולה
                      </li>
                    </ul>
                    <div className={styles.planCardCount}>
                      {(subs || []).filter(s => s.plan === plan && s.status === "active").length} פעילים
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
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
                  placeholder="חיפוש לפי אימייל…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  dir="ltr"
                />
                <select
                  className={styles.filterSelect}
                  value={filterPlan}
                  onChange={e => setFilterPlan(e.target.value)}
                >
                  <option value="all">כל התוכניות</option>
                  {PLAN_KEYS.map(p => (
                    <option key={p} value={p}>{getPlanLabel(p)}</option>
                  ))}
                </select>
                <select
                  className={styles.filterSelect}
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="all">כל הסטטוסים</option>
                  {STATUS_KEYS.map(s => (
                    <option key={s} value={s}>{getStatusLabel(s)}</option>
                  ))}
                </select>
              </div>
              <span className={styles.resultCount}>
                {filtered.length.toLocaleString()} מנויים
              </span>
            </div>

            {/* Empty state — no data at all */}
            {(subs || []).length === 0 && (
              <div className={styles.stateBox}>
                <p className={styles.emptyTitle}>אין מנויים עדיין</p>
                <p className={styles.emptyHint}>
                  מנויים יופיעו כאן לאחר שמשתמשים יירשמו למערכת ויוקצה להם תוכנית.
                </p>
              </div>
            )}

            {/* Empty state — filters produced no results */}
            {(subs || []).length > 0 && filtered.length === 0 && (
              <div className={styles.stateBox}>
                <p className={styles.emptyTitle}>אין תוצאות</p>
                <p className={styles.emptyHint}>שנה את הסינון כדי לראות מנויים.</p>
              </div>
            )}

            {/* Table */}
            {filtered.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>אימייל</th>
                      <th>תוכנית</th>
                      <th>סטטוס</th>
                      <th>נוצר</th>
                      <th>פג תוקף</th>
                      <th>גבולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <Fragment key={s.id}>
                        <tr
                          className={[
                            styles.dataRow,
                            s.status === "cancelled" || s.status === "expired" ? styles.rowDim : "",
                          ].filter(Boolean).join(" ")}
                        >
                          <td className={styles.emailCell}>{s.email}</td>
                          <td><PlanBadge plan={s.plan} /></td>
                          <td><StatusBadge status={s.status} /></td>
                          <td className={styles.dateCell}>{formatDate(s.created_at)}</td>
                          <td className={styles.dateCell}>{formatDate(s.expires_at)}</td>
                          <td>
                            <button
                              className={styles.expandBtn}
                              onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                              title="הצג גבולות תוכנית"
                            >
                              {expandedId === s.id ? "▲ סגור" : "▼ גבולות"}
                            </button>
                          </td>
                        </tr>
                        {expandedId === s.id && (
                          <tr className={styles.expandRow}>
                            <td colSpan={6} className={styles.expandCell}>
                              <div className={styles.expandContent}>
                                <span className={styles.expandTitle}>גבולות תוכנית {getPlanLabel(s.plan)}:</span>
                                <PlanLimitsPanel plan={s.plan} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className={styles.stateBox}>
            <span className={styles.loadingText}>טוען מנויים…</span>
          </div>
        )}

      </main>
    </div>
  );
}
