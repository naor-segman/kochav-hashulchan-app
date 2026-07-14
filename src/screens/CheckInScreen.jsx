import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSideLabel } from "../utils/eventHelpers.js";
import styles from "./CheckInScreen.module.css";

export default function CheckInScreen({ events, patchEventById }) {
  const { eventId } = useParams();
  const navigate    = useNavigate();
  const ev          = events.find(e => e.id === eventId);
  const [search, setSearch]     = useState("");
  const [lastChecked, setLastChecked] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  if (!ev) {
    navigate("/", { replace: true });
    return null;
  }

  const patchEvent = (patch) => patchEventById(eventId, patch);

  const toggleArrived = (guestId) => {
    const guest = ev.guests.find(g => g.id === guestId);
    patchEvent(e => ({
      ...e,
      guests: e.guests.map(g =>
        g.id === guestId ? { ...g, arrived: !g.arrived } : g
      ),
    }));
    if (!guest?.arrived) setLastChecked(guestId);
  };

  const setGift = (guestId, amount) => {
    patchEvent(e => ({
      ...e,
      guests: e.guests.map(g =>
        g.id === guestId ? { ...g, giftAmount: amount } : g
      ),
    }));
  };

  const sideLabel = s => getSideLabel(ev, s);

  const active = ev.guests.filter(g => g.rsvp !== "declined");
  const nArrived = ev.guests.filter(g => g.arrived).length;
  const totalGifts = ev.guests.reduce((s, g) => s + (g.giftAmount || 0), 0);
  const pct = active.length > 0 ? Math.round(nArrived / active.length * 100) : 0;

  const searchTrim = search.trim();
  const results = searchTrim.length >= 1
    ? active.filter(g =>
        g.name.includes(searchTrim) ||
        (g.phone && g.phone.replace(/\D/g, "").includes(searchTrim.replace(/\D/g, "")))
      ).sort((a, b) => a.name.localeCompare(b.name, "he"))
    : [];

  const tableOf = (g) => {
    const tid = ev.seating[g.id];
    return tid ? ev.tables.find(t => t.id === tid) : null;
  };

  return (
    <div className={styles.root}>
      {/* ── Top bar ── */}
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => navigate(`/events/${eventId}/seating`)}>
          ← חזור להושבה
        </button>
        <div className={styles.eventName}>{ev.name || "אירוע"}</div>
        <div className={styles.topStats}>
          <span className={styles.arrivedCount}>{nArrived}/{active.length}</span>
          {totalGifts > 0 && (
            <span className={styles.giftTotal}>💰 ₪{totalGifts.toLocaleString("he-IL")}</span>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className={styles.progressWrap}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: pct + "%" }} />
        </div>
        <span className={styles.progressLabel}>{pct}% הגיעו</span>
      </div>

      {/* ── Search ── */}
      <div className={styles.searchWrap}>
        <input
          ref={searchRef}
          className={styles.searchInput}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 חפש שם או טלפון..."
          inputMode="text"
          autoComplete="off"
        />
        {search && (
          <button className={styles.searchClear} onClick={() => { setSearch(""); searchRef.current?.focus(); }}>
            ✕
          </button>
        )}
      </div>

      {/* ── Last checked-in highlight ── */}
      {lastChecked && !searchTrim && (() => {
        const g = ev.guests.find(x => x.id === lastChecked);
        const t = g ? tableOf(g) : null;
        if (!g) return null;
        return (
          <div className={styles.lastChecked}>
            <span className={styles.lastCheckedIcon}>✓</span>
            <div className={styles.lastCheckedInfo}>
              <span className={styles.lastCheckedName}>{g.name}</span>
              {t && <span className={styles.lastCheckedTable}>שולחן {t.name}</span>}
            </div>
            <button className={styles.lastCheckedDismiss} onClick={() => setLastChecked(null)}>✕</button>
          </div>
        );
      })()}

      {/* ── Results ── */}
      {searchTrim.length >= 1 && results.length === 0 && (
        <div className={styles.noResult}>
          <div className={styles.noResultIcon}>🔍</div>
          <div className={styles.noResultText}>לא נמצא אורח עם שם "{searchTrim}"</div>
          <div className={styles.noResultSub}>בדוק את האיות או חפש לפי מספר טלפון</div>
        </div>
      )}

      <div className={styles.list}>
        {results.map(g => {
          const table = tableOf(g);
          const isLast = g.id === lastChecked;
          return (
            <div
              key={g.id}
              className={[
                styles.row,
                g.arrived ? styles.rowArrived : "",
                isLast ? styles.rowLast : "",
              ].filter(Boolean).join(" ")}
            >
              <div className={styles.rowMain}>
                <div className={styles.rowLeft}>
                  <span className={styles.guestName}>{g.name}</span>
                  <div className={styles.guestMeta}>
                    {sideLabel(g.side)} · {g.group}
                    {g.count > 1 && ` · ${g.count} מקומות`}
                    {g.phone && ` · ${g.phone}`}
                  </div>
                </div>
                <div className={styles.rowRight}>
                  {table
                    ? <span className={styles.tableTag}>שולחן {table.name}</span>
                    : <span className={styles.noTable}>לא שובץ</span>
                  }
                  <button
                    className={[styles.checkBtn, g.arrived ? styles.checkBtnDone : ""].filter(Boolean).join(" ")}
                    onClick={() => toggleArrived(g.id)}
                  >
                    {g.arrived ? "✓ הגיע/ה" : "צ׳ק אין"}
                  </button>
                </div>
              </div>
              {g.arrived && (
                <div className={styles.giftRow}>
                  <label className={styles.giftLabel}>💰 מתנה:</label>
                  <input
                    className={styles.giftInput}
                    type="number"
                    min="0"
                    step="50"
                    inputMode="numeric"
                    placeholder="₪ הכנס סכום"
                    value={g.giftAmount || ""}
                    onChange={e => setGift(g.id, e.target.value ? Math.max(0, parseInt(e.target.value) || 0) : 0)}
                  />
                  {g.giftAmount > 0 && (
                    <span className={styles.giftRecorded}>₪{g.giftAmount.toLocaleString("he-IL")} ✓</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Empty state (no search) ── */}
      {!searchTrim && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>✅</div>
          <div className={styles.emptyTitle}>מצב צ׳ק אין — {ev.name || "אירוע"}</div>
          <div className={styles.emptySub}>
            {nArrived > 0
              ? `${nArrived} אורחים הגיעו עד כה${totalGifts > 0 ? ` · ₪${totalGifts.toLocaleString("he-IL")} במתנות` : ""}`
              : "הקלד שם או מספר טלפון לחיפוש אורח"}
          </div>
        </div>
      )}
    </div>
  );
}
