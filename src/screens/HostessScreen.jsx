import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { fetchEventByToken } from "../utils/publicTokens.js";
import styles from "./HostessScreen.module.css";

const MOCK_EVENT = {
  name: "חתונת נועה וטל",
  guests: [
    { id: "1", name: "משפחת כהן",       count: 4, side: "bride" },
    { id: "2", name: "משפחת לוי",        count: 3, side: "groom" },
    { id: "3", name: "יעקב ורחל גולד",  count: 2, side: "bride" },
    { id: "4", name: "דוד ומרים שפירא", count: 5, side: "groom" },
    { id: "5", name: "נועם ברק",         count: 1, side: "bride" },
    { id: "6", name: "שרה ואיתן מזרחי", count: 2, side: "groom" },
    { id: "7", name: "רבקה שלום",        count: 1, side: "bride" },
    { id: "8", name: "משפחת אברהם",     count: 6, side: "groom" },
    { id: "9", name: "חיים ואסתר נחום",  count: 2, side: "bride" },
    { id: "10", name: "גיל ורות פרץ",   count: 3, side: "groom" },
  ],
  seating: {
    "1": "t1", "2": "t3", "3": "t2", "4": "t5",
    "5": "t1", "6": "t4", "7": "t2", "8": "t6",
    "9": "t3", "10": "t4",
  },
  tables: [
    { id: "t1", name: "שולחן 1", capacity: 8 },
    { id: "t2", name: "שולחן 2", capacity: 6 },
    { id: "t3", name: "שולחן 3", capacity: 8 },
    { id: "t4", name: "שולחן 4", capacity: 6 },
    { id: "t5", name: "שולחן 5", capacity: 8 },
    { id: "t6", name: "שולחן 6 — VIP", capacity: 10 },
  ],
};

export default function HostessScreen() {
  const { token } = useParams();
  const [event, setEvent]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState("");
  const [found, setFound]     = useState(null); // null | guest object

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ev = await fetchEventByToken("hostess", token);
      if (!cancelled) {
        setEvent(ev || MOCK_EVENT);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const ev = event || MOCK_EVENT;
  const tableMap = useMemo(() => {
    const m = {};
    (ev.tables || []).forEach(t => { m[t.id] = t; });
    return m;
  }, [ev.tables]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q || q.length < 2) return [];
    const lq = q.toLowerCase();
    return (ev.guests || []).filter(g => g.name.toLowerCase().includes(lq));
  }, [query, ev.guests]);

  const handleSelect = (g) => {
    setFound(g);
    setQuery(g.name);
  };

  const tableFor = (g) => {
    const tableId = ev.seating?.[g.id];
    if (!tableId) return null;
    return tableMap[tableId] || null;
  };

  if (loading) {
    return (
      <div className={styles.root}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.headerStar} aria-hidden="true">✦</span>
        <div>
          <h1 className={styles.headerTitle}>{ev.name}</h1>
          <p className={styles.headerSub}>מערכת הסדרת מושבים</p>
        </div>
      </header>

      <div className={styles.searchWrap}>
        <input
          className={styles.searchInput}
          value={query}
          onChange={e => { setQuery(e.target.value); setFound(null); }}
          placeholder="חפש שם אורח…"
          autoFocus
          autoComplete="off"
        />
        {query.length > 0 && (
          <button
            className={styles.clearBtn}
            onClick={() => { setQuery(""); setFound(null); }}
            type="button"
            aria-label="נקה חיפוש"
          >✕</button>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {results.length > 0 && !found && (
        <div className={styles.dropdown}>
          {results.map(g => (
            <button
              key={g.id}
              className={styles.dropItem}
              onClick={() => handleSelect(g)}
              type="button"
            >
              <span className={styles.dropName}>{g.name}</span>
              <span className={styles.dropCount}>{g.count || 1} אנשים</span>
            </button>
          ))}
        </div>
      )}

      {/* Result panel */}
      {found && (() => {
        const t = tableFor(found);
        return (
          <div className={t ? styles.resultCard : styles.resultCardUnseated}>
            {t ? (
              <>
                <div className={styles.tableNum}>{t.name}</div>
                <div className={styles.guestResultName}>{found.name}</div>
                <div className={styles.guestResultCount}>
                  {found.count || 1} מקומות שמורים
                </div>
              </>
            ) : (
              <>
                <div className={styles.unseatedIcon}>⚠</div>
                <div className={styles.guestResultName}>{found.name}</div>
                <div className={styles.unseatedMsg}>לא שובץ עדיין</div>
              </>
            )}
          </div>
        );
      })()}

      {/* Empty state */}
      {!found && query.length > 1 && results.length === 0 && (
        <div className={styles.noResult}>
          <span>לא נמצא אורח בשם "{query}"</span>
        </div>
      )}

      {!found && query.length === 0 && (
        <div className={styles.hint}>
          <span className={styles.hintIcon}>🔍</span>
          <span>הכנס שם אורח כדי למצוא את מספר השולחן</span>
        </div>
      )}

      <footer className={styles.footer}>
        <span className={styles.footerStar} aria-hidden="true">✦</span>
        <span>כוכב השולחן</span>
      </footer>
    </div>
  );
}
