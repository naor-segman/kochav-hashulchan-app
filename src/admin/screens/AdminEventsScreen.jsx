import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import styles from "./AdminEventsScreen.module.css";
import Loading from "../../components/feedback/Loading.jsx";
import SectionMark from "../../components/ui/SectionMark.jsx";
import Icon from "../../components/ui/Icon.jsx";
import { formatDate, formatRelative } from "../lib/adminFormat.js";
import { useAdminLogout } from "../lib/useAdminLogout.js";
import { deriveEventStatus } from "../lib/eventStatus.js";
import { attachWindowMeta } from "../lib/listWindow.js";
import { COMPANY } from "../../data/company.js";

// ── Data fetching ─────────────────────────────────────────────────────────────
//
// Single query: events + embedded profiles(email) via FK events.user_id → profiles.id.
// PostgREST resolves the many-to-one automatically; profiles comes back as an object.

// The window this screen loads. It was the bare literal 500 inside the query
// and appeared nowhere in the UI, so the 501st event did not exist as far as
// the panel was concerned — and worse, the count beside the search box printed
// the WINDOW as if it were the total. "500 אירועים" on a table holding 1,240 is
// not a rounding error, it is a wrong answer to the only question this screen
// is asked. Same cap and same treatment as USERS_PAGE in AdminUsersScreen.
const EVENTS_PAGE = 500;

async function loadEventsData() {
  const [listRes, totalRes] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, user_id, name, type, date, venue, guest_count, table_count, seated_pct," +
        " created_at, updated_at, profiles!user_id(email)"
      )
      .order("updated_at", { ascending: false })
      .limit(EVENTS_PAGE),
    // The TRUE row count. Without it the screen cannot tell a full window from
    // a complete table — `rows.length === 500` means "500 events" and "at least
    // 500 events" equally, and it was reading it as the first.
    // `.catch` and not just the `error` field: `attachWindowMeta` degrades
    // gracefully for count: null, but only if the promise RESOLVES. A rejection
    // from the auxiliary count would reject the pair and take the events list
    // down with it — a screen that used to work when only this query failed.
    supabase.from("events").select("id", { count: "exact", head: true })
      .then(r => r, () => ({ count: null })),
  ]);

  const { data, error } = listRes;
  if (error) throw error;

  const rows = (data || []).map((ev) => ({
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

  // `total` / `truncated` carried on the array itself, the shape
  // AdminUsersScreen established. The decision is in admin/lib/listWindow.js
  // because three more admin screens still need it — and because the obvious
  // test for it (`rows.length >= limit`) is wrong at exactly `limit` rows.
  return attachWindowMeta(rows, EVENTS_PAGE, totalRes.count);
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AdminEventsScreen() {
  const handleLogout = useAdminLogout();
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
      setError(err.message || "טעינת האירועים נכשלה.");
      setEvents([]);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);


  // Collect distinct event types for the filter dropdown. Derived from the
  // LOADED WINDOW, so past the cap a type that only appears on older events is
  // missing from the dropdown entirely. Not worth a second query — the type
  // list is five Hebrew strings from constants.js and the notice beside the
  // count already says the list is a window — but it is a real limit, not an
  // oversight, and it should be read as one.
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
          <Link to="/admin/dashboard" className={styles.backLink} aria-label="חזרה ללוח הבקרה">→</Link>
          <SectionMark name="adminEvents" tone="admin" size={20} className={styles.brandMark} />
          <span className={styles.brandName}>כל האירועים</span>
          <span className={styles.brandSep}>·</span>
          <span className={styles.brandSub}>{COMPANY.name}</span>
          {/* Was green and unconditional, including with a 500 banner under it
              and zero rows loaded. Now it reports the state it is in. */}
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
            <button className={styles.retryBtn} onClick={loadEvents}>נסה שוב</button>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            {/* Was the literal "⌕" — a fourth icon vocabulary alongside
                SectionMark, Icon and TableGlyph, and positioned with
                `left: 11px` in a right-to-left interface, i.e. ~300px from
                where the caret and the typing actually start. */}
            <span className={styles.searchIcon}><Icon name="search" size={16} /></span>
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

          {/* Three different sentences, because there are three different
              truths and the first version of this fix only told two of them.
              A filter SEARCHES THE WINDOW, so its denominator is the window —
              "152 מתוך 1,240" read as "152 of the 1,240 events match", when
              the search never saw 740 of them and the real answer across the
              table was closer to 380. That is the same class of wrong answer
              this whole row set out to remove, in the very `?owner=` flow it
              called the case that actually misleads: an owner with 8 events,
              3 of them inside the window, read "3 מתוך 1,240".

              The wording is deliberately NOT the users screen's. That one says
              "500 הראשונים" while ordering by created_at DESC — it shows the
              newest and calls them the first. */}
          {!loading && !error && events && (
            <span className={styles.resultCount}>
              {hasFilters ? (
                events.truncated ? (
                  <>
                    {filtered.length.toLocaleString()} מתוך {EVENTS_PAGE.toLocaleString()} שנטענו
                    <span className={styles.truncNote}>
                      {" · "}מתוך {(events.total ?? events.length).toLocaleString()} סה״כ
                    </span>
                  </>
                ) : (
                  <>{filtered.length.toLocaleString()} מתוך {events.length.toLocaleString()} אירועים</>
                )
              ) : (
                <>
                  {filtered.length.toLocaleString()}
                  {filtered.length !== (events.total ?? events.length)
                    ? ` מתוך ${(events.total ?? events.length).toLocaleString()}`
                    : ""} אירועים
                  {events.truncated && (
                    <span className={styles.truncNote}> · מוצגים {EVENTS_PAGE} שעודכנו לאחרונה</span>
                  )}
                </>
              )}
            </span>
          )}
        </div>

        {/* ── Loading ── */}
        {loading && (
          <Loading rows={5} label="טוען אירועים…" />
        )}

        {/* ── Empty state ── */}
        {!loading && !error && filtered.length === 0 && (
          <div className={styles.stateBox}>
            {hasFilters
              ? <>
                  <p className={styles.emptyTitle}>לא נמצאו תוצאות</p>
                  {/* This is the case the truncation actually bites in, and it
                      is why the notice could not live in the toolbar alone.
                      AdminUsersScreen links here as ?owner=<email>. The search
                      runs client-side over the loaded window, so a customer
                      whose events all sit outside it produced "לא נמצאו
                      תוצאות" — which reads as "this customer has no events",
                      not as "we did not look at all of them". */}
                  <p className={styles.emptyHint}>
                    {events?.truncated
                      ? `החיפוש רץ על ${EVENTS_PAGE} האירועים שעודכנו לאחרונה, מתוך ${(events.total ?? events.length).toLocaleString()} — אירוע שלא עודכן זמן רב לא נכלל בו.`
                      : "נסה לשנות את פילטרי החיפוש"}
                  </p>
                </>
              : <><p className={styles.emptyTitle}>אין אירועים ענן עדיין</p><p className={styles.emptyHint}>כאשר משתמש מחובר יצור אירוע, הוא יסונכרן לענן ויופיע כאן אוטומטית</p></>
            }
          </div>
        )}

        {/* ── Events table ── */}
        {!loading && !error && filtered.length > 0 && (
          <>
          {/* Eleven columns fit at 1440 and do not below it — three of them
              render at 390px. Shown by a media query at exactly the width the
              table stops fitting, so it never claims a scroll that is not
              there. The pinned action column casts the matching shadow. */}
          <p className={styles.scrollHint}>
            <Icon name="list" size={14} />
            הטבלה רחבה מהמסך — אפשר לגלול אותה לצדדים. עמודת הפעולה נשארת במקומה.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>שם האירוע</th>
                  <th>סוג</th>
                  <th>תאריך</th>
                  <th>אולם</th>
                  <th>בעלים</th>
                  {/* guest_count is the SEAT total (cloudSync sums g.count),
                      not the number of guest rows — the detail screen shows
                      rows under the same word, so the two disagreed by ~1.6x
                      on a real event. Name it for what it holds. */}
                  <th className={styles.numCol}>מקומות</th>
                  <th className={styles.numCol}>שולחנות</th>
                  <th className={styles.numCol}>ישיבה</th>
                  <th>עדכון</th>
                  <th>סטטוס</th>
                  <th className={styles.actionCol}>פעולה</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => {
                  const status = deriveEventStatus(ev, styles);
                  return (
                    <tr key={ev.id}>
                      <td className={styles.nameCell} title={ev.name}>{ev.name}</td>
                      <td className={styles.typeCell}>{ev.type}</td>
                      <td className={styles.dateCell}>{formatDate(ev.date)}</td>
                      <td className={styles.venueCell} title={ev.venue || undefined}>
                        {ev.venue || <span className={styles.muted}>—</span>}
                      </td>
                      {/* dir="ltr" is what decides WHICH END the ellipsis eats.
                          In the RTL cell it ate the logical end of the LTR
                          string — the mailbox name, the part that identifies
                          the customer — and kept the shared domain. */}
                      <td className={styles.ownerCell} dir="ltr">
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
                      {/* 0% seated is a measurement, not missing data. "—"
                          told the operator we had no number for an event we
                          know is at zero. */}
                      <td className={styles.numCell}>{`${Math.round(ev.seated_pct)}%`}</td>
                      <td className={styles.relativeCell}>{formatRelative(ev.updated_at)}</td>
                      <td><span className={status.cls}>{status.label}</span></td>
                      <td className={styles.actionCell}>
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
          </>
        )}

      </main>
    </div>
  );
}
