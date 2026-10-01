import { useState, useEffect, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import {
  getPlanMeta,
  displayStatus,
  getPlanLabel,
  getStatusLabel,
  getPlanLimits,
  isKnownPlan,
  isKnownStatus,
  ALARMING_STATUSES,
  PLAN_KEYS,
  STATUS_KEYS,
} from "../lib/planConfig.js";
import { formatDate, countPhrase } from "../lib/adminFormat.js";
import { attachWindowMeta } from "../lib/listWindow.js";
import { useAdminLogout } from "../lib/useAdminLogout.js";
import Icon from "../../components/ui/Icon.jsx";
import styles from "./AdminSubscriptionsScreen.module.css";
import Loading from "../../components/feedback/Loading.jsx";
import SectionMark from "../../components/ui/SectionMark.jsx";
import { COMPANY } from "../../data/company.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

// The newest SUBS_PAGE purchases, with the table's own count beside them.
// Until 29.9 the list stopped at 500 and said nothing (WORKPLAN 58) — the
// events screen already said it; this one now says it the same way.
const SUBS_PAGE = 500;

const SUBS_COLUMNS = "id, plan, status, payment_past_due, started_at, expires_at, created_at, updated_at, profiles!user_id(email)";
const listSubs = (cols) => supabase
  .from("subscriptions")
  .select(cols)
  .order("created_at", { ascending: false })
  .limit(SUBS_PAGE);

async function loadSubscriptionsData() {
  const [firstRes, countRes] = await Promise.all([
    // event_id and the event's name: since 28.9 a purchase unlocks ONE event,
    // and the list could not say which (WORKPLAN 122).
    listSubs(`${SUBS_COLUMNS}, event_id, is_manually_managed, events!event_id(name)`),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }),
  ]);
  // The embed was never run against the live API from here. If it is refused,
  // the list still loads without the event column rather than not at all.
  const listRes = firstRes.error ? await listSubs(SUBS_COLUMNS) : firstRes;

  if (listRes.error) throw listRes.error;
  const rows = (listRes.data || []).map(row => ({
    ...row,
    email: row.profiles?.email || "—",
    eventLabel: firstRes.error ? "—" : purchaseScope(row),
  }));
  return attachWindowMeta(rows, SUBS_PAGE, countRes.error ? null : countRes.count);
}

/** What a purchase unlocks, in words: the event by name, an admin comp on the
 *  whole account, or nothing (its event was deleted — 20260928000200). */
function purchaseScope(row) {
  if (row.event_id) return row.events?.name?.trim() || "אירוע ללא שם";
  return row.is_manually_managed ? "כל החשבון (ידני)" : "— לא פותח אירוע";
}

// ── Badge components ──────────────────────────────────────────────────────────

// Three plan colours and six status colours came out of PLAN_META / STATUS_META
// as inline styles. The panel is monochrome by contract, and both of these are
// ORDERED quantities that a value ladder expresses better than a hue does:
// quiet → outline → filled ink. The one exception is the panel's one semantic
// colour, spent on the one state that needs somebody to act on it today.
//
// Explicit maps, not `styles["plan_" + key]`: a computed CSS-module lookup that
// misses renders class="undefined" and loses every style with no error.
const PLAN_BADGE = {
  free:       "badgeQuiet",
  pro:        "badgeOutline",
  enterprise: "badgeFilled",
};

// The statuses a row can actually have — see STATUS_KEYS in planConfig.js.
// Four unreachable Stripe subscription states were removed in checklist 94.
const STATUS_BADGE = {
  active:    "badgeFilled",
  trialing:  "badgeOutline",
  cancelled: "badgeQuiet",
  expired:   "badgeQuiet",
  past_due:  "badgeAlarm",
};

function PlanBadge({ plan }) {
  // An unmapped DB value used to render its raw English key as if it were a
  // Hebrew label. It is now labelled as unknown, with the raw value on hover.
  const cls = styles[PLAN_BADGE[plan]] ?? styles.badgeUnknown;
  return (
    <span className={cls} title={isKnownPlan(plan) ? undefined : (plan || "")}>
      {getPlanLabel(plan)}
    </span>
  );
}

function StatusBadge({ status }) {
  const cls = styles[STATUS_BADGE[status]] ?? styles.badgeUnknown;
  return (
    <span
      className={cls}
      title={isKnownStatus(status) ? undefined : (status || "")}
      data-alarm={ALARMING_STATUSES.has(status) ? "true" : undefined}
    >
      {getStatusLabel(status)}
    </span>
  );
}

// A ✓ / — pair inside a Hebrew line is another bidi trap and another glyph
// vocabulary; the check comes from the shared line-icon set and the "off" line
// simply loses the mark instead of gaining a dash that reads as a minus.
function FeatureLine({ on, label }) {
  return (
    <li className={on ? styles.featureOn : styles.featureOff}>
      <span className={styles.featureMark} aria-hidden="true">
        {on ? <Icon name="check" size={14} /> : null}
      </span>
      {label}
    </li>
  );
}

// ── Plan limits tooltip panel ─────────────────────────────────────────────────

function PlanLimitsPanel({ plan }) {
  const limits = getPlanLimits(plan);
  const rows = [
    { label: "אירועים מקס׳",    value: limits.maxEvents   === Infinity ? "ללא הגבלה" : limits.maxEvents },
    { label: "אורחים מקס׳",     value: limits.maxGuests   === Infinity ? "ללא הגבלה" : limits.maxGuests },
    { label: "ייצוא מתקדם",     value: limits.advancedExports ? "כלול" : "לא כלול" },
    { label: "תכונות AI",       value: limits.aiFeatures    ? "כלול" : "לא כלול" },
    { label: "שיתוף פעולה",     value: limits.collaboration ? "כלול" : "לא כלול" },
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
  const handleLogout = useAdminLogout();

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
      if ((err.code === "42P01" || err.code === "PGRST205")) {
        setNotConfigured(true);
        setSubs([]);
      } else {
        setError(err.message || "טעינת הרכישות נכשלה.");
        setSubs([]);
      }
    }
  }, []);

  useEffect(() => { loadSubs(); }, [loadSubs]);


  // ── Derived filtered list ──────────────────────────────────────────────────

  const filtered = (subs || []).filter(s => {
    if (filterPlan   !== "all" && s.plan   !== filterPlan)   return false;
    if (filterStatus !== "all" && displayStatus(s) !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.email.toLowerCase().includes(q) && !s.eventLabel.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const loading = subs === null;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link to="/admin/dashboard" className={styles.backLink} aria-label="חזרה ללוח הבקרה">→</Link>
          <SectionMark name="adminSubscriptions" tone="admin" size={20} className={styles.brandMark} />
          <span className={styles.brandName}>רכישות ותשלומים</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>{COMPANY.name}</span>
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
            <h2 className={styles.notConfiguredTitle}>טבלת הרכישות לא נמצאה</h2>
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
                const meta   = getPlanMeta(plan);
                const limits = getPlanLimits(plan);
                return (
                  // The 3px top rule was magenta / blue / grey and the label
                  // was the same colour again — two hues doing the job the
                  // three words already do, on the quietest screen in the app.
                  <div key={plan} className={styles.planCard}>
                    <div className={styles.planCardHeader}>
                      <span className={styles.planCardLabel}>{meta.label}</span>
                      <span className={styles.planCardSub}>{meta.labelEn}</span>
                    </div>
                    <ul className={styles.planCardList}>
                      <li>{limits.maxEvents === Infinity ? "ללא הגבלת אירועים" : `עד ${limits.maxEvents} אירועים`}</li>
                      <li>{limits.maxGuests  === Infinity ? "ללא הגבלת אורחים"  : `עד ${limits.maxGuests} אורחים`}</li>
                      <FeatureLine on={limits.advancedExports} label="ייצוא מתקדם" />
                      <FeatureLine on={limits.aiFeatures}      label="תכונות AI" />
                      <FeatureLine on={limits.collaboration}   label="שיתוף פעולה" />
                    </ul>
                    <div className={styles.planCardCount}>
                      {/* Read "1 פעילים" on every plan that had exactly one. */}
                      {countPhrase(
                        (subs || []).filter(s => s.plan === plan && s.status === "active" && !s.payment_past_due).length,
                        { none: "אין רכישות פעילות", one: "רכישה פעילה אחת", many: "%n רכישות פעילות" }
                      )}
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
                {filtered.length.toLocaleString()} רכישות
                {/* What was LOADED, not the page size, and never "500 מתוך 500":
                    when the count query failed a full window is only a guess
                    that more exist, and says so (29.9 review). */}
                {subs?.truncated && (
                  <span className={styles.truncNote}>
                    {" · "}מוצגות {subs.length.toLocaleString()} האחרונות
                    {subs.total > subs.length ? ` מתוך ${subs.total.toLocaleString()}` : " — ייתכן שיש עוד"}
                  </span>
                )}
              </span>
            </div>

            {/* Empty state — no data at all */}
            {(subs || []).length === 0 && (
              <div className={styles.stateBox}>
                <p className={styles.emptyTitle}>אין רכישות עדיין</p>
                <p className={styles.emptyHint}>
                  רכישות יופיעו כאן כשמארחים ירכשו חבילה לאירוע.
                </p>
              </div>
            )}

            {/* Empty state — filters produced no results */}
            {(subs || []).length > 0 && filtered.length === 0 && (
              <div className={styles.stateBox}>
                <p className={styles.emptyTitle}>אין תוצאות</p>
                <p className={styles.emptyHint}>שנו את הסינון כדי לראות רכישות.</p>
              </div>
            )}

            {/* Table */}
            {filtered.length > 0 && (
              <>
              {/* 550px of columns. At 320 the phone shows two and a half —
                  נוצר / פג תוקף / גבולות are off the side with no affordance. */}
              <p className={styles.scrollHint}>
                <Icon name="list" size={14} />
                הטבלה רחבה מהמסך — אפשר לגלול אותה לצדדים.
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>אימייל</th>
                      <th>תוכנית</th>
                      <th>אירוע</th>
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
                          <td className={styles.emailCell} dir="ltr" title={s.email}>{s.email}</td>
                          <td><PlanBadge plan={s.plan} /></td>
                          <td title={s.eventLabel}>{s.eventLabel}</td>
                          <td><StatusBadge status={displayStatus(s)} /></td>
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
                            <td colSpan={7} className={styles.expandCell}>
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
              </>
            )}
          </>
        )}

        {/* ── Loading ── */}
        {loading && (
          <Loading rows={4} label="טוען רכישות…" />
        )}

      </main>
    </div>
  );
}
