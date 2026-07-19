import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSideLabel } from "../utils/eventHelpers.js";
import { uid } from "../utils/uid.js";
import styles from "./CheckInScreen.module.css";

export default function CheckInScreen({ events, patchEventById }) {
  const { eventId } = useParams();
  const navigate    = useNavigate();
  const ev          = events.find(e => e.id === eventId);
  const [search, setSearch]         = useState("");
  const [lastChecked, setLastChecked] = useState(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInCount, setWalkInCount] = useState(1);
  const [walkInSide, setWalkInSide] = useState("bride");
  const [viewMode, setViewMode]     = useState("name"); // "name" | "table"
  const searchRef = useRef(null);
  const walkInRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!ev) navigate("/", { replace: true });
  }, [ev, navigate]);

  if (!ev) return null;

  const patchEvent = (patch) => patchEventById(eventId, patch);

  const toggleArrived = (guestId, wasArrived) => {
    patchEvent(e => ({
      ...e,
      guests: e.guests.map(g =>
        g.id === guestId ? { ...g, arrived: !wasArrived } : g
      ),
    }));
    if (!wasArrived) setLastChecked(guestId);
  };

  const addWalkIn = () => {
    const name = walkInName.trim();
    if (!name) return;
    const newGuest = {
      id: uid(), name,
      count: walkInCount || 1,
      side: walkInSide,
      group: "הגיע ביום האירוע",
      rsvp: "confirmed",
      phone: "",
      notes: "",
      meal: "regular",
      arrived: true,
    };
    patchEvent(e => ({ ...e, guests: [...e.guests, newGuest] }));
    setLastChecked(newGuest.id);
    setWalkInOpen(false);
    setWalkInName("");
    setWalkInCount(1);
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const setGift = (guestId, amount) => {
    patchEvent(e => ({
      ...e,
      guests: e.guests.map(g =>
        g.id === guestId ? { ...g, giftAmount: amount } : g
      ),
    }));
  };

  const markTableArrived = (tableId, arrived) => {
    patchEvent(e => ({
      ...e,
      guests: e.guests.map(g =>
        e.seating?.[g.id] === tableId ? { ...g, arrived } : g
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
          ← חזור
        </button>
        <div className={styles.eventName}>{ev.name || "אירוע"}</div>
        <button className={styles.walkInTopBtn} onClick={() => { setWalkInName(""); setWalkInOpen(true); }}>
          ➕ אורח חדש
        </button>
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

      {/* ── View mode tabs ── */}
      <div className={styles.viewTabs}>
        <button
          className={[styles.viewTab, viewMode === "name" ? styles.viewTabActive : ""].filter(Boolean).join(" ")}
          onClick={() => setViewMode("name")}
        >
          🔍 לפי שם
        </button>
        <button
          className={[styles.viewTab, viewMode === "table" ? styles.viewTabActive : ""].filter(Boolean).join(" ")}
          onClick={() => setViewMode("table")}
        >
          ⬡ לפי שולחן
        </button>
      </div>

      {/* ── Search (name mode only) ── */}
      {viewMode === "name" && (
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
      )}

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

      {/* ── Walk-in modal ── */}
      {walkInOpen && (
        <div className={styles.walkInOverlay} onClick={e => { if (e.target === e.currentTarget) setWalkInOpen(false); }}>
          <div className={styles.walkInPanel}>
            <div className={styles.walkInTitle}>הוסף אורח שהגיע ביום האירוע</div>
            <input
              ref={walkInRef}
              className={styles.walkInInput}
              value={walkInName}
              onChange={e => setWalkInName(e.target.value)}
              placeholder="שם מלא..."
              onKeyDown={e => { if (e.key === "Enter") addWalkIn(); }}
              autoFocus
            />
            <div className={styles.walkInRow}>
              <label className={styles.walkInLabel}>מספר מקומות:</label>
              <input
                className={styles.walkInCountInput}
                type="number"
                min="1"
                max="20"
                value={walkInCount}
                onChange={e => setWalkInCount(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            <div className={styles.walkInRow}>
              <label className={styles.walkInLabel}>צד:</label>
              <div className={styles.walkInSideBtns}>
                <button
                  className={[styles.walkInSideBtn, walkInSide === "bride" ? styles.walkInSideBtnActive : ""].filter(Boolean).join(" ")}
                  onClick={() => setWalkInSide("bride")}
                >{sideLabel("bride")}</button>
                <button
                  className={[styles.walkInSideBtn, walkInSide === "groom" ? styles.walkInSideBtnActive : ""].filter(Boolean).join(" ")}
                  onClick={() => setWalkInSide("groom")}
                >{sideLabel("groom")}</button>
              </div>
            </div>
            <div className={styles.walkInActions}>
              <button className={styles.walkInSaveBtn} onClick={addWalkIn} disabled={!walkInName.trim()}>
                הוסף וסמן כהגיע/ה
              </button>
              <button className={styles.walkInCancelBtn} onClick={() => setWalkInOpen(false)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {searchTrim.length >= 1 && results.length === 0 && (
        <div className={styles.noResult}>
          <div className={styles.noResultIcon}>🔍</div>
          <div className={styles.noResultText}>לא נמצא אורח עם שם &ldquo;{searchTrim}&rdquo;</div>
          <div className={styles.noResultSub}>בדוק את האיות או חפש לפי מספר טלפון</div>
          <button className={styles.walkInTriggerBtn} onClick={() => { setWalkInName(searchTrim); setWalkInOpen(true); }}>
            הוסף כאורח שהגיע ביום האירוע
          </button>
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
                    onClick={() => toggleArrived(g.id, g.arrived)}
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

      {/* ── Empty state (name mode, no search) ── */}
      {viewMode === "name" && !searchTrim && (
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

      {/* ── Table view ── */}
      {viewMode === "table" && (
        <div className={styles.tableView}>
          {ev.tables.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>⬡</div>
              <div className={styles.emptyTitle}>לא הוגדרו שולחנות</div>
            </div>
          )}
          {ev.tables.map(t => {
            const tGuests  = ev.guests.filter(g => ev.seating[g.id] === t.id && g.rsvp !== "declined");
            const nTabArrived = tGuests.filter(g => g.arrived).length;
            const allArrived  = tGuests.length > 0 && nTabArrived === tGuests.length;
            return (
              <div key={t.id} className={[styles.tableBlock, allArrived ? styles.tableBlockDone : ""].filter(Boolean).join(" ")}>
                <div className={styles.tableBlockHead}>
                  <div className={styles.tableBlockName}>
                    {t.name}
                    <span className={styles.tableBlockCount}>{nTabArrived}/{tGuests.length}</span>
                  </div>
                  <div className={styles.tableBlockActions}>
                    {!allArrived && tGuests.length > 0 && (
                      <button className={styles.tableMarkAllBtn} onClick={() => markTableArrived(t.id, true)}>
                        כולם הגיעו ✓
                      </button>
                    )}
                    {allArrived && (
                      <button className={styles.tableUnmarkAllBtn} onClick={() => markTableArrived(t.id, false)}>
                        בטל הכל
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.tableGuestList}>
                  {tGuests.length === 0
                    ? <span className={styles.tableGuestEmpty}>שולחן ריק</span>
                    : tGuests.map(g => (
                        <div
                          key={g.id}
                          className={[styles.tableGuestRow, g.arrived ? styles.tableGuestRowDone : ""].filter(Boolean).join(" ")}
                          onClick={() => toggleArrived(g.id, g.arrived)}
                        >
                          <span className={styles.tableGuestName}>{g.name}{g.count > 1 ? ` ×${g.count}` : ""}</span>
                          <span className={[styles.tableGuestStatus, g.arrived ? styles.tableGuestStatusDone : ""].filter(Boolean).join(" ")}>
                            {g.arrived ? "✓ הגיע/ה" : "טרם הגיע"}
                          </span>
                        </div>
                      ))
                  }
                </div>
              </div>
            );
          })}
          {/* Walk-in guests with no table assignment are otherwise invisible in table view */}
          {(() => {
            const unassigned = active.filter(g => !ev.seating?.[g.id]);
            if (unassigned.length === 0) return null;
            const nUnassignedArrived = unassigned.filter(g => g.arrived).length;
            return (
              <div className={styles.tableBlock}>
                <div className={styles.tableBlockHead}>
                  <div className={styles.tableBlockName}>
                    לא משובצים
                    <span className={styles.tableBlockCount}>{nUnassignedArrived}/{unassigned.length}</span>
                  </div>
                </div>
                <div className={styles.tableGuestList}>
                  {unassigned.map(g => (
                    <div
                      key={g.id}
                      className={[styles.tableGuestRow, g.arrived ? styles.tableGuestRowDone : ""].filter(Boolean).join(" ")}
                      onClick={() => toggleArrived(g.id, g.arrived)}
                    >
                      <span className={styles.tableGuestName}>{g.name}{g.count > 1 ? ` ×${g.count}` : ""}</span>
                      <span className={[styles.tableGuestStatus, g.arrived ? styles.tableGuestStatusDone : ""].filter(Boolean).join(" ")}>
                        {g.arrived ? "✓ הגיע/ה" : "טרם הגיע"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
