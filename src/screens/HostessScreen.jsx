import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { fetchEventByToken } from "../utils/publicTokens.js";
import styles from "./HostessScreen.module.css";

// TODO: use real event data from fetchEventByToken
const MOCK_GUESTS = [
  { id: "1",  name: "משפחת כהן",          count: 4, tableId: "t3" },
  { id: "2",  name: "אבי ומרגלית לוי",    count: 2, tableId: "t1" },
  { id: "3",  name: "יעקב ורחל גולד",     count: 2, tableId: "t2" },
  { id: "4",  name: "דוד ומרים שפירא",    count: 5, tableId: "t5" },
  { id: "5",  name: "נועם ברק",            count: 1, tableId: "t1" },
  { id: "6",  name: "שרה ואיתן מזרחי",    count: 2, tableId: "t4" },
  { id: "7",  name: "רבקה שלום",           count: 3, tableId: "t7" },
  { id: "8",  name: "משפחת אברהם",        count: 6, tableId: "t6" },
  { id: "9",  name: "חיים ואסתר נחום",    count: 2, tableId: "t3" },
  { id: "10", name: "גיל ורות פרץ",       count: 3, tableId: "t8" },
];

const MOCK_TABLES = [
  { id: "t1", name: "שולחן 1" },
  { id: "t2", name: "שולחן 2" },
  { id: "t3", name: "שולחן 3" },
  { id: "t4", name: "שולחן 4" },
  { id: "t5", name: "שולחן 5" },
  { id: "t6", name: "שולחן 6 — VIP" },
  { id: "t7", name: "שולחן 7" },
  { id: "t8", name: "שולחן 8" },
];

function buildTableMap(tables) {
  const m = {};
  tables.forEach(t => { m[t.id] = t; });
  return m;
}

export default function HostessScreen() {
  const { token } = useParams();
  const [status, setStatus]       = useState("loading"); // "loading" | "ready" | "error"
  const [eventName, setEventName] = useState("");
  const [query, setQuery]         = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ev = await fetchEventByToken("hostess", token);
        if (!cancelled) {
          if (ev && ev.name) setEventName(ev.name);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("ready"); // fall back to mock
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (status === "ready") {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [status]);

  const tableMap = buildTableMap(MOCK_TABLES);

  const q = query.trim();
  const ql = q.toLowerCase();
  const results = q.length >= 1
    ? MOCK_GUESTS.filter(g => g.name.toLowerCase().includes(ql))
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
            const table = g.tableId ? tableMap[g.tableId] : null;
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
