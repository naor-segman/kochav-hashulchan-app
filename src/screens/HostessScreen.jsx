import { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { fetchHostessData } from "../utils/publicTokens.js";
import styles from "./HostessScreen.module.css";

// Normalize for search: trim, collapse whitespace, strip Hebrew niqqud, lowercase.
function norm(s) {
  return String(s || "")
    .replace(/[֑-ׇ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export default function HostessScreen() {
  const { token } = useParams();
  const [status, setStatus]       = useState("loading"); // "loading" | "ready" | "notfound" | "error"
  const [eventName, setEventName] = useState("");
  const [guests, setGuests]       = useState([]);
  const [tables, setTables]       = useState([]);
  const [seating, setSeating]     = useState({});
  const [query, setQuery]         = useState("");
  const [mode, setMode]           = useState("search"); // "search" | "browse"
  const [openTable, setOpenTable] = useState(null);      // tableId in browse mode
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchHostessData(token);
        if (cancelled) return;
        if (!data) { setStatus("notfound"); return; }
        setEventName(data.name);
        setGuests(data.guests);
        setTables(data.tables);
        setSeating(data.seating);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (status === "ready" && mode === "search") {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [status, mode]);

  const tableMap = useMemo(() => {
    const m = {};
    tables.forEach(t => { m[t.id] = t; });
    return m;
  }, [tables]);

  // Guests grouped by their assigned table.
  const occupantsByTable = useMemo(() => {
    const m = {};
    guests.forEach(g => {
      const tid = seating[g.id];
      if (!tid) return;
      (m[tid] = m[tid] || []).push(g);
    });
    Object.values(m).forEach(list => list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "he")));
    return m;
  }, [guests, seating]);

  // Live stats for the door team.
  const stats = useMemo(() => {
    const seated = guests.filter(g => seating[g.id]).length;
    const seats  = guests.reduce((s, g) => s + (g.count || 1), 0);
    return { total: guests.length, seated, seats, tables: tables.length };
  }, [guests, seating, tables]);

  const q  = norm(query);

  // Search matches guest names AND table names/numbers.
  const guestResults = q.length >= 1
    ? guests.filter(g =>
        norm(g.name).includes(q) ||
        (Array.isArray(g.companions) && g.companions.some(c => norm(c).includes(q))))
    : [];
  const tableMatches = q.length >= 1
    ? tables.filter(t => norm(t.name).includes(q) && occupantsByTable[t.id]?.length)
    : [];

  const seatLabel = (count) => {
    const n = count || 1;
    return n === 1 ? "אורח אחד" : `${n} אורחים`;
  };

  const tablesSorted = useMemo(
    () => [...tables].sort((a, b) => (a.name || "").localeCompare(b.name || "", "he", { numeric: true })),
    [tables],
  );

  if (status === "loading") {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} aria-hidden="true" />
          <span className={styles.loadingText}>טוען...</span>
        </div>
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>
          <span className={styles.stateIcon} aria-hidden="true">⚠</span>
          <span className={styles.loadingText}>הקישור אינו תקין או שהאירוע הוסר</span>
        </div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className={styles.root}>
        <div className={styles.loadingWrap}>
          <span className={styles.stateIcon} aria-hidden="true">⚠</span>
          <span className={styles.loadingText}>שגיאת חיבור — נסו לרענן את הדף</span>
        </div>
      </div>
    );
  }

  // A seated guest card with the big table number.
  const GuestCard = (g) => {
    const table = seating[g.id] ? tableMap[seating[g.id]] : null;
    const comps = Array.isArray(g.companions) ? g.companions.filter(Boolean) : [];
    return (
      <li key={g.id} className={table ? styles.card : styles.cardUnseated}>
        {table ? (
          <>
            <div className={styles.tableLabel} aria-label={`שולחן: ${table.name}`}>{table.name}</div>
            <div className={styles.guestName}>{g.name}</div>
            <div className={styles.seatCount}>{seatLabel(g.count)}</div>
            {comps.length > 0 && <div className={styles.guestComps}>עם: {comps.join(", ")}</div>}
          </>
        ) : (
          <>
            <div className={styles.unseatedBadge} aria-label="לא שובץ">⚠ לא שובץ</div>
            <div className={styles.guestName}>{g.name}</div>
            <div className={styles.seatCount}>{seatLabel(g.count)}</div>
            {comps.length > 0 && <div className={styles.guestComps}>עם: {comps.join(", ")}</div>}
          </>
        )}
      </li>
    );
  };

  // Occupants of one table, shown when a table is matched/opened.
  const TableOccupants = (t) => {
    const list = occupantsByTable[t.id] || [];
    const seats = list.reduce((s, g) => s + (g.count || 1), 0);
    return (
      <div key={t.id} className={styles.occCard}>
        <div className={styles.occHead}>
          <span className={styles.occTable}>{t.name}</span>
          <span className={styles.occMeta}>{list.length} רשומות · {seats} מקומות</span>
        </div>
        <ul className={styles.occList} role="list">
          {list.map(g => (
            <li key={g.id} className={styles.occRow}>
              <span className={styles.occName}>{g.name}</span>
              <span className={styles.occCount}>{g.count || 1}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className={styles.root}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <span className={styles.headerLogo} aria-hidden="true">✦</span>
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>{eventName || "מערכת הסדרת מושבים"}</h1>
          <p className={styles.headerSub}>כוכב השולחן</p>
        </div>
      </header>

      {/* ── Live stats ── */}
      <div className={styles.statsBar}>
        <div className={styles.stat}><span className={styles.statNum}>{stats.total}</span><span className={styles.statLabel}>רשומות</span></div>
        <div className={styles.stat}><span className={styles.statNum}>{stats.seats}</span><span className={styles.statLabel}>מקומות</span></div>
        <div className={styles.stat}><span className={styles.statNum}>{stats.seated}</span><span className={styles.statLabel}>שובצו</span></div>
        <div className={styles.stat}><span className={styles.statNum}>{stats.tables}</span><span className={styles.statLabel}>שולחנות</span></div>
      </div>

      {/* ── Mode toggle ── */}
      <div className={styles.modeToggle} role="tablist">
        <button
          className={[styles.modeBtn, mode === "search" ? styles.modeBtnActive : ""].filter(Boolean).join(" ")}
          onClick={() => setMode("search")} role="tab" aria-selected={mode === "search"}
        >🔍 חיפוש אורח</button>
        <button
          className={[styles.modeBtn, mode === "browse" ? styles.modeBtnActive : ""].filter(Boolean).join(" ")}
          onClick={() => setMode("browse")} role="tab" aria-selected={mode === "browse"}
        >🍽 עיון לפי שולחן</button>
      </div>

      {/* ═══ SEARCH MODE ═══ */}
      {mode === "search" && (
        <>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">🔍</span>
            <input
              ref={searchRef}
              className={styles.searchInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="חפשו שם אורח או שולחן..."
              autoComplete="off" inputMode="text" type="search" aria-label="חיפוש אורח או שולחן"
            />
            {query.length > 0 && (
              <button className={styles.clearBtn} onClick={() => { setQuery(""); searchRef.current?.focus(); }} type="button" aria-label="נקו חיפוש">✕</button>
            )}
          </div>

          {q.length === 0 && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon} aria-hidden="true">🔍</span>
              <p className={styles.emptyTitle}>חפשו שם אורח</p>
              <p className={styles.emptyHint}>הקלידו שם אורח או מספר שולחן</p>
            </div>
          )}

          {q.length >= 1 && guestResults.length === 0 && tableMatches.length === 0 && (
            <div className={styles.noResult}>
              <span className={styles.noResultIcon} aria-hidden="true">🤷</span>
              <p className={styles.noResultText}>לא נמצא — נסו שם אחר</p>
            </div>
          )}

          {guestResults.length > 0 && (
            <ul className={styles.results} role="list">
              {guestResults.map(GuestCard)}
            </ul>
          )}

          {tableMatches.length > 0 && (
            <div className={styles.tableSection}>
              <div className={styles.sectionTitle}>שולחנות תואמים</div>
              {tableMatches.map(TableOccupants)}
            </div>
          )}
        </>
      )}

      {/* ═══ BROWSE MODE ═══ */}
      {mode === "browse" && (
        <div className={styles.browseWrap}>
          <div className={styles.tableChips} role="list">
            {tablesSorted.map(t => {
              const n = occupantsByTable[t.id]?.length || 0;
              return (
                <button
                  key={t.id}
                  className={[styles.tableChip, openTable === t.id ? styles.tableChipActive : ""].filter(Boolean).join(" ")}
                  onClick={() => setOpenTable(id => id === t.id ? null : t.id)}
                >
                  <span className={styles.tableChipName}>{t.name}</span>
                  <span className={styles.tableChipCount}>{n}</span>
                </button>
              );
            })}
          </div>
          {openTable && tableMap[openTable] && (
            <div className={styles.tableSection}>{TableOccupants(tableMap[openTable])}</div>
          )}
          {!openTable && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon} aria-hidden="true">🍽</span>
              <p className={styles.emptyTitle}>בחרו שולחן</p>
              <p className={styles.emptyHint}>הקישו על שולחן כדי לראות מי יושב בו</p>
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span className={styles.footerStar} aria-hidden="true">✦</span>
        <span>כוכב השולחן</span>
      </footer>
    </div>
  );
}
