import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import styles from "./AdminEventsScreen.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.includes("T") ? "" : "T00:00:00"));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatRelative(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 7)  return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  return formatDate(iso);
}

// Derive a display status from the event's denormalised counters.
// Returns { label, cls } where cls is a CSS module key.
function deriveStatus(ev) {
  const g = ev.guest_count ?? 0;
  const t = ev.table_count ?? 0;
  const s = Number(ev.seated_pct ?? 0);

  if (g === 0 && t === 0) return { label: "ריק",          cls: styles.statusEmpty    };
  if (g === 0)            return { label: "אין אורחים",   cls: styles.statusWarning  };
  if (t === 0)            return { label: "אין שולחנות",  cls: styles.statusWarning  };
  if (s >= 90)            return { label: "מוכן",          cls: styles.statusReady    };
  if (s >= 50)            return { label: "בעיבוד",        cls: styles.statusProgress };
  if (s >  0)             return { label: "בעיות",         cls: styles.statusIssues   };
  return                         { label: "ממתין לסידור",  cls: styles.statusPending  };
}

// ── Data fetching ─────────────────────────────────────────────────────────────
//
// Single query: events + embedded profiles(email) via FK events.user_id → profiles.id.
// PostgREST resolves the many-to-one automatically; profiles comes back as an object.

async function loadEventsData() {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, user_id, name, type, date, venue, guest_count, table_count, seated_pct," +
      " created_at, updated_at, profiles!user_id(email)"
    )
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  return (data || []).map((ev) => ({
    id:          ev.id,
    user_id:     ev.user_id,
    name:        ev.name || "—",
    type:        ev.type || "—",
    date:        ev.date || null,
    venue:       ev.venue || null,
    owner_email: ev.profiles?.email || null,
    guest_count: ev.guest_count  ?? 0,
    table_count: ev.table_count  ?? 0,
    seated_pct:  Number(ev.seated_pct ?? 0),
    created_at:  ev.created_at,
    updated_at:  ev.updated_at,
  }));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminEventsScreen() {
  const navigate = useNavigate();
  const [searchParams]  = useSearchParams();

  const [adminEmail, setAdminEmail] = useState(null);
  const [events,     setEvents]     = useState(null);   // null = loading
  const [error,      setError]      = useState(null);
  // Pre-fill search from ?owner= URL param (linked from AdminUsersScreen).
  const [search,     setSearch]     = useState(() => searchParams.get("owner") || "");
  const [typeFilter, setTypeFilter] = useState("");     // "" = all types

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  const loadEvents = useCallback(async () => {
    if (!supabase) return;
    setEvents(null);
    setError(null);
    try {
      setEvents(await loadEventsData());
    } catch (err) {
      setError(err.message || "Failed to load events.");
      setEvents([]);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  // Collect distinct event types for the filter dropdown.
  const eventTypes = useMemo(() => {
    if (!events) return [];
    return [...new Set(events.map((e) => e.type).filter(Boolean))].sort();
  }, [events]);

  // Client-side filter: text search + type dropdown.
  const filtered = useMemo(() => {
    if (!events) return [];
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (typeFilter && ev.type !== typeFilter) return false;
      if (q) {
        return (
          ev.name.toLowerCase().includes(q) ||
          (ev.venue || "").toLowerCase().includes(q) ||
          (ev.owner_email || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [events, search, typeFilter]);

  const loading      = events === null;
  const hasFilters   = search.trim() || typeFilter;

  return (
    <div className={styles.page}>

      {/* ── Top bar ── */}
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link to="/admin/dashboard" className={styles.backLink}>←</Link>
          <span className={styles.brandMark}>✦</span>
          <span className={styles.brandName}>כל האירועים</span>
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
            <button className={styles.retryBtn} onClick={loadEvents}>נסה שוב</button>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="חיפוש לפי שם, אולם, או בעלים…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              dir="auto"
            />
          </div>

          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            disabled={loading || eventTypes.length === 0}
          >
            <option value="">כל הסוגים</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {!loading && !error && (
            <span className={styles.resultCount}>
              {filtered.length.toLocaleString()}
              {events && filtered.length !== events.length
                ? ` מתוך ${events.length.toLocaleString()}`
                : ""
              } אירועים
            </span>
          )}
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className={styles.stateBox}>
            <span className={styles.loadingText}>טוען אירועים…</span>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && filtered.length === 0 && (
          <div className={styles.stateBox}>
            {hasFilters
              ? <><p className={styles.emptyTitle}>לא נמצאו תוצאות</p><p className={styles.emptyHint}>נסה לשנות את פילטרי החיפוש</p></>
              : <><p className={styles.emptyTitle}>אין אירועים ענן עדיין</p><p className={styles.emptyHint}>כאשר משתמש מחובר יצור אירוע, הוא יסונכרן לענן ויופיע כאן אוטומטית</p></>
            }
          </div>
        )}

        {/* ── Events table ── */}
        {!loading && !error && filtered.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>שם האירוע</th>
                  <th>סוג</th>
                  <th>תאריך</th>
                  <th>אולם</th>
                  <th>בעלים</th>
                  <th className={styles.numCol}>אורחים</th>
                  <th className={styles.numCol}>שולחנות</th>
                  <th className={styles.numCol}>ישיבה</th>
                  <th>עדכון</th>
                  <th>סטטוס</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => {
                  const status = deriveStatus(ev);
                  return (
                    <tr key={ev.id}>
                      <td className={styles.nameCell}>{ev.name}</td>
                      <td className={styles.typeCell}>{ev.type}</td>
                      <td className={styles.dateCell}>{formatDate(ev.date)}</td>
                      <td className={styles.venueCell}>
                        {ev.venue || <span className={styles.muted}>—</span>}
                      </td>
                      <td className={styles.ownerCell}>
                        {ev.owner_email
                          ? (
                            <Link
                              to={`/admin/users`}
                              className={styles.ownerLink}
                              title={`צפה במשתמש: ${ev.owner_email}`}
                            >
                              {ev.owner_email}
                            </Link>
                          )
                          : <span className={styles.muted}>—</span>
                        }
                      </td>
                      <td className={styles.numCell}>{ev.guest_count}</td>
                      <td className={styles.numCell}>{ev.table_count}</td>
                      <td className={styles.numCell}>
                        {ev.seated_pct > 0
                          ? `${Math.round(ev.seated_pct)}%`
                          : <span className={styles.muted}>—</span>
                        }
                      </td>
                      <td className={styles.relativeCell}>{formatRelative(ev.updated_at)}</td>
                      <td><span className={status.cls}>{status.label}</span></td>
                      <td>
                        <Link
                          to={`/admin/events/${ev.id}`}
                          className={styles.viewLink}
                        >
                          צפה
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </main>
    </div>
  );
}
