import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { fetchHostessData } from "../utils/publicTokens.js";
import styles from "./HostessScreen.module.css";

function buildTableMap(tables) {
  const m = {};
  tables.forEach(t => { m[t.id] = t; });
  return m;
}

export default function HostessScreen() {
  const { token } = useParams();
  const [status, setStatus]       = useState("loading"); // "loading" | "ready" | "notfound" | "error"
  const [eventName, setEventName] = useState("");
  const [guests, setGuests]       = useState([]);
  const [tables, setTables]       = useState([]);
  const [seating, setSeating]     = useState({});
  const [query, setQuery]         = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchHostessData(token);
        if (cancelled) return;
        if (!data) {
          setStatus("notfound");
          return;
        }
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
    if (status === "ready") {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [status]);

  const tableMap = buildTableMap(tables);

  const q = query.trim();
  const ql = q.toLowerCase();
  const results = q.length >= 1
    ? guests.filter(g => (g.name || "").toLowerCase().includes(ql))
    : [];

  const seatLabel = (count) => {
    const n = count || 1;
    return n === 1 ? "אורח אחד" : `${n} אורחים`;
  };

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
          <span className={styles.loadingText}>שגיאת חיבור — נסה לרענן את הדף</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <span className={styles.headerLogo} aria-hidden="true">✦</span>
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>
            {eventName || "מערכת הסדרת מושבים"}
          </h1>
          <p className={styles.headerSub}>כוכב השולחן</p>
        </div>
      </header>

      {/* ── Search ── */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">🔍</span>
        <input
          ref={searchRef}
          className={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="חפש שם אורח..."
          autoComplete="off"
          inputMode="text"
          type="search"
          aria-label="חיפוש אורח"
        />
        {query.length > 0 && (
          <button
            className={styles.clearBtn}
            onClick={() => { setQuery(""); searchRef.current?.focus(); }}
            type="button"
            aria-label="נקה חיפוש"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Empty state — before typing ── */}
      {q.length === 0 && (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon} aria-hidden="true">🔍</span>
          <p className={styles.emptyTitle}>חפש שם אורח</p>
          <p className={styles.emptyHint}>הקלד שם כדי למצוא את מספר השולחן</p>
        </div>
      )}

      {/* ── No results ── */}
      {q.length >= 1 && results.length === 0 && (
        <div className={styles.noResult}>
          <span className={styles.noResultIcon} aria-hidden="true">🤷</span>
          <p className={styles.noResultText}>לא נמצא — נסה שם אחר</p>
        </div>
      )}

      {/* ── Result cards ── */}
      {results.length > 0 && (
        <ul className={styles.results} role="list">
          {results.map(g => {
            const tableId = seating[g.id];
            const table = tableId ? tableMap[tableId] : null;
            return (
              <li key={g.id} className={table ? styles.card : styles.cardUnseated}>
                {table ? (
                  <>
                    <div className={styles.tableLabel} aria-label={`שולחן: ${table.name}`}>
                      {table.name}
                    </div>
                    <div className={styles.guestName}>{g.name}</div>
                    <div className={styles.seatCount}>{seatLabel(g.count)}</div>
                  </>
                ) : (
                  <>
                    <div className={styles.unseatedBadge} aria-label="לא שובץ">
                      ⚠ לא שובץ
                    </div>
                    <div className={styles.guestName}>{g.name}</div>
                    <div className={styles.seatCount}>{seatLabel(g.count)}</div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span className={styles.footerStar} aria-hidden="true">✦</span>
        <span>כוכב השולחן</span>
      </footer>
    </div>
  );
}
