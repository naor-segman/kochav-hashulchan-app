import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import styles from "./AdminEventDetailScreen.module.css";

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

const SIDE_LABEL = { bride: "כלה", groom: "חתן" };
const CONSTRAINT_LABEL = { together: "יחד", apart: "רחוק" };

// ── Payload section component ─────────────────────────────────────────────────

function Section({ title, count, children, empty }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>{title}</span>
        {count !== undefined && (
          <span className={styles.sectionCount}>{count}</span>
        )}
      </div>
      {empty
        ? <p className={styles.payloadEmpty}>{empty}</p>
        : children
      }
    </div>
  );
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function loadEvent(eventId) {
  const { data, error } = await supabase
    .from("events")
    .select("*, profiles!user_id(email, full_name)")
    .eq("id", eventId)
    .single();

  if (error) throw error;
  return data;
}

// ── Screen ────────────────────────────────────────────────────────────────────

const GUESTS_DISPLAY_LIMIT = 100;

export default function AdminEventDetailScreen() {
  const { eventId }  = useParams();
  const navigate     = useNavigate();

  const [adminEmail, setAdminEmail] = useState(null);
  const [event,      setEvent]      = useState(null);   // null = loading
  const [error,      setError]      = useState(null);
  const [notFound,   setNotFound]   = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAdminEmail(user.email);
    });
  }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    setEvent(null);
    setError(null);
    setNotFound(false);
    try {
      setEvent(await loadEvent(eventId));
    } catch (err) {
      // PGRST116 = PostgREST "not found" for .single()
      if (err.code === "PGRST116") {
        setNotFound(true);
      } else {
        setError(err.message || "Failed to load event.");
      }
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    navigate("/admin/login", { replace: true });
  };

  // ── Derived payload data ────────────────────────────────────────────────────

  const {
    payload, tables, guests, constraints, seating,
    guestMap, tableMap,
    seatedGuestCount, totalGuestCount,
    tableSeating,
  } = useMemo(() => {
    const p   = event?.payload || {};
    const tbl = Array.isArray(p.tables)      ? p.tables      : [];
    const gst = Array.isArray(p.guests)      ? p.guests      : [];
    const con = Array.isArray(p.constraints) ? p.constraints : [];
    const sea = (p.seating && typeof p.seating === "object" && !Array.isArray(p.seating))
                ? p.seating : {};

    const gMap = new Map(gst.map((g) => [g.id, g]));
    const tMap = new Map(tbl.map((t) => [t.id, t]));

    // Reverse seating map: tableId → guestId[]
    const tSeat = {};
    Object.entries(sea).forEach(([guestId, tableId]) => {
      if (!tSeat[tableId]) tSeat[tableId] = [];
      tSeat[tableId].push(guestId);
    });

    const seatedIds  = new Set(Object.keys(sea));
    const seatedCnt  = gst.filter((g) => seatedIds.has(g.id))
                           .reduce((s, g) => s + (g.count || 1), 0);
    const totalCnt   = gst.reduce((s, g) => s + (g.count || 1), 0);

    return {
      payload: p,
      tables: tbl, guests: gst, constraints: con, seating: sea,
      guestMap: gMap, tableMap: tMap,
      seatedGuestCount: seatedCnt, totalGuestCount: totalCnt,
      tableSeating: tSeat,
    };
  }, [event]);

  // ── Render states ────────────────────────────────────────────────────────────

  const topbar = (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <Link to="/admin/events" className={styles.backLink}>←</Link>
        <span className={styles.brandMark}>✦</span>
        <span className={styles.brandName}>פרטי אירוע</span>
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
  );

  if (event === null && !error && !notFound) {
    return (
      <div className={styles.page}>
        {topbar}
        <main className={styles.main}>
          <div className={styles.stateBox}>
            <span className={styles.loadingText}>טוען אירוע…</span>
          </div>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className={styles.page}>
        {topbar}
        <main className={styles.main}>
          <div className={styles.stateBox}>
            <p className={styles.emptyTitle}>האירוע לא נמצא</p>
            <p className={styles.emptyHint}>ייתכן שהאירוע נמחק או שה-ID שגוי.</p>
            <Link to="/admin/events" className={styles.backBtn}>חזרה לרשימת האירועים</Link>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        {topbar}
        <main className={styles.main}>
          <div className={styles.errorBanner}>
            {error}
            <button className={styles.retryBtn} onClick={load}>נסה שוב</button>
          </div>
        </main>
      </div>
    );
  }

  const status = deriveStatus(event);
  const ownerEmail = event.profiles?.email || null;

  // ── Full detail view ─────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {topbar}

      <main className={styles.main}>

        {/* ── Title row ── */}
        <div className={styles.titleRow}>
          <h1 className={styles.eventName}>{event.name || "ללא שם"}</h1>
          <span className={status.cls}>{status.label}</span>
        </div>

        {/* ── Meta card ── */}
        <div className={styles.metaCard}>
          <div className={styles.metaGrid}>
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>סוג</span>
              <span className={styles.metaValue}>{event.type || "—"}</span>
            </div>
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>תאריך</span>
              <span className={styles.metaValue}>{formatDate(event.date)}</span>
            </div>
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>אולם</span>
              <span className={styles.metaValue}>{event.venue || "—"}</span>
            </div>
            {payload.brideName && (
              <div className={styles.metaField}>
                <span className={styles.metaLabel}>כלה</span>
                <span className={styles.metaValue}>{payload.brideName}</span>
              </div>
            )}
            {payload.groomName && (
              <div className={styles.metaField}>
                <span className={styles.metaLabel}>חתן</span>
                <span className={styles.metaValue}>{payload.groomName}</span>
              </div>
            )}
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>בעלים</span>
              <span className={styles.metaValue}>{ownerEmail || "—"}</span>
            </div>
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>נוצר</span>
              <span className={styles.metaValue}>{formatRelative(event.created_at)}</span>
            </div>
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>עדכון אחרון</span>
              <span className={styles.metaValue}>{formatRelative(event.updated_at)}</span>
            </div>
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>גרסה</span>
              <span className={styles.metaValue}>v{event.version ?? 1}</span>
            </div>
            <div className={styles.metaField}>
              <span className={styles.metaLabel}>מזהה ענן</span>
              <span className={[styles.metaValue, styles.metaId].join(" ")}>{event.id}</span>
            </div>
            {payload.localId && payload.localId !== event.id && (
              <div className={styles.metaField}>
                <span className={styles.metaLabel}>מזהה מקומי</span>
                <span className={[styles.metaValue, styles.metaId].join(" ")}>{payload.localId}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Stats chips ── */}
        <div className={styles.statsRow}>
          <div className={styles.statChip}>
            <span className={styles.statChipValue}>{event.guest_count}</span>
            <span className={styles.statChipLabel}>אורחים</span>
          </div>
          <div className={styles.statChip}>
            <span className={styles.statChipValue}>{event.table_count}</span>
            <span className={styles.statChipLabel}>שולחנות</span>
          </div>
          <div className={styles.statChip}>
            <span className={styles.statChipValue}>
              {event.seated_pct > 0 ? `${Math.round(event.seated_pct)}%` : "—"}
            </span>
            <span className={styles.statChipLabel}>ישיבה</span>
          </div>
          {totalGuestCount > 0 && (
            <div className={styles.statChip}>
              <span className={styles.statChipValue}>{seatedGuestCount} / {totalGuestCount}</span>
              <span className={styles.statChipLabel}>מקומות ישיבה</span>
            </div>
          )}
        </div>

        {/* ── Payload sections ── */}

        {/* Tables */}
        <Section
          title="שולחנות"
          count={tables.length}
          empty={tables.length === 0 ? "לא הוגדרו שולחנות לאירוע זה" : null}
        >
          <div className={styles.tableGrid}>
            {tables.map((t) => {
              const seatedHere = (tableSeating[t.id] || []).reduce(
                (sum, gid) => sum + (guestMap.get(gid)?.count || 1), 0
              );
              return (
                <div key={t.id} className={styles.tableCard}>
                  <span className={styles.tableName}>{t.name || "—"}</span>
                  <span className={styles.tableCapacity}>
                    {seatedHere > 0
                      ? `${seatedHere} / ${t.capacity ?? "—"}`
                      : `${t.capacity ?? "—"}`
                    } מקומות
                  </span>
                  {t.type && <span className={styles.tableType}>{t.type}</span>}
                </div>
              );
            })}
          </div>
        </Section>

        {/* Guests */}
        <Section
          title="אורחים"
          count={guests.length}
          empty={guests.length === 0 ? "לא נוספו אורחים לאירוע זה" : null}
        >
          {guests.length > GUESTS_DISPLAY_LIMIT && (
            <p className={styles.truncateNote}>
              מציג {GUESTS_DISPLAY_LIMIT} מתוך {guests.length} אורחים
            </p>
          )}
          <div className={styles.guestTableWrap}>
            <table className={styles.guestTable}>
              <thead>
                <tr>
                  <th>שם</th>
                  <th>צד</th>
                  <th>קבוצה</th>
                  <th className={styles.numCol}>מקומות</th>
                  <th>שולחן</th>
                </tr>
              </thead>
              <tbody>
                {guests.slice(0, GUESTS_DISPLAY_LIMIT).map((g) => {
                  const tId    = seating[g.id];
                  const tName  = tId ? (tableMap.get(tId)?.name || "—") : null;
                  return (
                    <tr key={g.id}>
                      <td className={styles.guestName}>{g.name || "—"}</td>
                      <td>
                        {g.side
                          ? <span className={g.side === "bride" ? styles.sideBride : styles.sideGroom}>
                              {SIDE_LABEL[g.side] || g.side}
                            </span>
                          : <span className={styles.muted}>—</span>
                        }
                      </td>
                      <td className={styles.guestGroup}>{g.group || <span className={styles.muted}>—</span>}</td>
                      <td className={styles.numCell}>{g.count || 1}</td>
                      <td className={styles.guestSeated}>
                        {tName
                          ? <span className={styles.seatedAt}>{tName}</span>
                          : <span className={styles.notSeated}>לא שובץ</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Constraints */}
        <Section
          title="אילוצים"
          count={constraints.length}
          empty={constraints.length === 0 ? "לא הוגדרו אילוצים לאירוע זה" : null}
        >
          <ul className={styles.constraintList}>
            {constraints.map((c) => {
              const nameA = guestMap.get(c.guestA)?.name || c.guestA || "—";
              const nameB = guestMap.get(c.guestB)?.name || c.guestB || "—";
              return (
                <li key={c.id} className={styles.constraintRow}>
                  <span className={c.type === "together" ? styles.ctTogether : styles.ctApart}>
                    {CONSTRAINT_LABEL[c.type] || c.type}
                  </span>
                  <span className={styles.constraintNames}>
                    <strong>{nameA}</strong>
                    <span className={styles.constraintConnector}>
                      {c.type === "together" ? "עם" : "לא עם"}
                    </span>
                    <strong>{nameB}</strong>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Seating summary */}
        {Object.keys(seating).length > 0 && (
          <Section title="סיכום ישיבה" count={undefined}>
            <div className={styles.seatingSummary}>
              <div className={styles.seatingStatRow}>
                <span className={styles.seatingStatLabel}>אורחים ששובצו</span>
                <span className={styles.seatingStatValue}>
                  {seatedGuestCount.toLocaleString()} מתוך {totalGuestCount.toLocaleString()}
                </span>
              </div>
              <div className={styles.seatingStatRow}>
                <span className={styles.seatingStatLabel}>שולחנות פעילים</span>
                <span className={styles.seatingStatValue}>
                  {Object.keys(tableSeating).length} מתוך {tables.length}
                </span>
              </div>
            </div>
          </Section>
        )}

      </main>
    </div>
  );
}
