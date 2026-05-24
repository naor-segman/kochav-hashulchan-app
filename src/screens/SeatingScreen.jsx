import { useState, useMemo } from "react";
import {
  DndContext, DragOverlay,
  useDraggable, useDroppable,
  PointerSensor, TouchSensor,
  useSensor, useSensors,
} from "@dnd-kit/core";
import { autoAssign, computeViolations } from "../logic/seating.js";
import { exportToExcel } from "../utils/exportHelpers.js";
import Banner from "../components/feedback/Banner.jsx";
import CapBar from "../components/ui/CapBar.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SideDot from "../components/ui/SideDot.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import TypeTag from "../components/ui/TypeTag.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./SeatingScreen.module.css";

function DroppableWrapper({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return children({ ref: setNodeRef, isOver });
}

function DraggableGuestRow({ guestId, className, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: guestId });
  return (
    <div
      ref={setNodeRef}
      className={[className, styles.draggableRow, isDragging ? styles.guestDragging : ""].filter(Boolean).join(" ")}
      {...attributes}
      {...listeners}
    >
      <span className={styles.dragHandle} aria-hidden="true">⠿</span>
      {children}
    </div>
  );
}

const fmtDate = dateStr => {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" });
  } catch { return dateStr; }
};

const MAX_UNDO = 20;

export default function SeatingScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [expandedTable, setExpandedTable]   = useState(null);
  const [activeId, setActiveId]             = useState(null);
  const [seatingHistory, setSeatingHistory] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const violations = useMemo(() =>
    computeViolations(ev.guests, ev.tables, ev.constraints, ev.seating),
    [ev.guests, ev.tables, ev.constraints, ev.seating]
  );

  const unassigned     = ev.guests.filter(g => !ev.seating[g.id]);
  const nAssigned      = ev.guests.filter(g => ev.seating[g.id]).length;
  const nAssignedSeats = ev.guests.filter(g => ev.seating[g.id]).reduce((s, g) => s + (g.count || 1), 0);
  const totalSeats     = ev.guests.reduce((s, g) => s + (g.count || 1), 0);
  const totalCap       = ev.tables.reduce((s, t) => s + t.capacity, 0);
  const allSeated      = nAssigned === ev.guests.length && ev.guests.length > 0;
  const noProblems     = violations.length === 0;
  const noTables       = ev.tables.length === 0;
  const noGuests       = ev.guests.length === 0;

  const sideLabel   = s => s === "bride" ? (ev.brideName ? "צד " + ev.brideName : "צד כלה") : (ev.groomName ? "צד " + ev.groomName : "צד חתן");
  const tableGuests = tid => ev.guests.filter(g => ev.seating[g.id] === tid);
  const tableSeats  = tid => ev.guests
    .filter(g => ev.seating[g.id] === tid)
    .reduce((s, g) => s + (g.count || 1), 0);

  const violatedTables = new Set(
    violations.flatMap(v => [v.tableA, v.tableB]).filter(Boolean)
  );

  const activeGuest = activeId ? ev.guests.find(g => g.id === activeId) : null;

  const pushHistory = () => {
    setSeatingHistory(h => [...h.slice(-(MAX_UNDO - 1)), ev.seating]);
  };

  const runAuto = () => {
    if (noTables) { showToast("יש להגדיר שולחנות תחילה", "err"); return; }
    if (noGuests) { showToast("יש להוסיף אורחים תחילה", "err"); return; }
    pushHistory();
    const newSeating = autoAssign(ev.guests, ev.tables, ev.constraints);
    patchEvent(e => Object.assign({}, e, { seating: newSeating }));
    const placed = Object.keys(newSeating).length;
    const missed = ev.guests.length - placed;
    if (missed > 0)
      showToast("שובצו " + placed + " אורחים. " + missed + " לא נכנסו — הוסף מקומות נוספים", "err");
    else
      showToast("כל " + placed + " האורחים שובצו ✓");
    setExpandedTable(null);
  };

  const clearAll = () => {
    if (!confirm(
      "לנקות את כל ההושבה?\n\n" +
      "כל " + nAssigned + " האורחים השובצים יחזרו לרשימת הממתינים.\n" +
      "ניתן לשחזר בלחיצה על \"↩ בטל\" — אך לא לאחר יציאה מהמסך."
    )) return;
    pushHistory();
    patchEvent(e => Object.assign({}, e, { seating: {} }));
    showToast("ההושבה נוקתה — " + nAssigned + " אורחים ממתינים לשיבוץ");
    setExpandedTable(null);
  };

  const assignGuest = (guestId, tableId) => {
    pushHistory();
    patchEvent(e => {
      const s = Object.assign({}, e.seating);
      if (!tableId) delete s[guestId];
      else s[guestId] = tableId;
      return Object.assign({}, e, { seating: s });
    });
  };

  const undo = () => {
    if (seatingHistory.length === 0) return;
    const prev = seatingHistory[seatingHistory.length - 1];
    setSeatingHistory(h => h.slice(0, -1));
    patchEvent(e => Object.assign({}, e, { seating: prev }));
    showToast("השינוי בוטל ✓");
  };

  const handleDragStart  = ({ active }) => setActiveId(active.id);
  const handleDragCancel = () => setActiveId(null);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const guestId = active.id;
    if (over.id === "unassigned") {
      if (!ev.seating[guestId]) return;
      assignGuest(guestId, null);
      return;
    }
    const toTableId = over.id.replace(/^table-/, "");
    if (ev.seating[guestId] === toTableId) return;
    const targetTable = ev.tables.find(t => t.id === toTableId);
    if (targetTable) {
      const occupiedSeats = ev.guests
        .filter(g => ev.seating[g.id] === toTableId)
        .reduce((s, g) => s + (g.count || 1), 0);
      const draggedSeats = ev.guests.find(g => g.id === guestId)?.count || 1;
      if (occupiedSeats + draggedSeats > targetTable.capacity) {
        showToast("השולחן מלא — לא ניתן להוסיף אורחים", "err");
        return;
      }
    }
    assignGuest(guestId, toTableId);
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* screenContent class is used only by @media print to hide the interactive UI */}
        <div className={[base.page, styles.screenContent].join(" ")}>
          <PageHeader
            title="סידור הושבה"
            icon="🪑"
            sub="חשב הושבה אוטומטית ואז ערוך ידנית לפי הצורך."
            aside={
              <div className={base.pills}>
                <StatPill n={nAssigned}         label="שובצו"   color={allSeated ? "var(--green)" : "var(--accent)"} />
                <StatPill n={unassigned.length} label="ממתינים" color={unassigned.length > 0 ? "var(--warn)" : undefined} />
                <StatPill n={violations.length} label="הפרות"   color={violations.length > 0 ? "var(--red)" : undefined} />
              </div>
            }
          />

          <div className={styles.stepGuide}>
            <span className={styles.stepBadge}>שלב 5 מתוך 5 — סידור הושבה</span>
            <span className={styles.stepText}>הריצו את הסידור האוטומטי ואז גררו אורחים בין שולחנות לפי הצורך. כל שינוי נשמר מיידית.</span>
          </div>

          {noTables && (
            <Banner variant="warn">
              יש להגדיר שולחנות לפני סידור ההושבה.
              <button className={base.btnSm} style={{ marginInlineEnd: 8 }} onClick={() => go("tables")}>עבור לשולחנות</button>
            </Banner>
          )}
          {noGuests && (
            <Banner variant="warn">
              יש להוסיף אורחים לפני סידור ההושבה.
              <button className={base.btnSm} style={{ marginInlineEnd: 8 }} onClick={() => go("guests")}>עבור לאורחים</button>
            </Banner>
          )}

          <div className={styles.runCard}>
            <div className={styles.runCardInfo}>
              <div className={styles.runCardTitle}>✦ חשב הושבה אוטומטית</div>
              <div className={styles.runCardSub}>
                {noTables ? "לפני ההרצה — הגדירו שולחנות בשלב 2."
                  : noGuests ? "לפני ההרצה — הוסיפו אורחים בשלב 3."
                  : "המערכת תשבץ את כל האורחים תוך כיבוד קבוצות, צדדים ואילוצים."}
              </div>
              <div className={styles.runCardStats}>
                {nAssignedSeats} / {totalSeats} מקומות שובצו · {nAssigned}/{ev.guests.length} רשומות · {totalCap} כסאות באולם
              </div>
            </div>
            <div className={styles.runCardActions}>
              <button className={styles.runBtn} onClick={runAuto} disabled={noTables || noGuests}>
                {nAssigned > 0 ? "חשב מחדש" : "חשב הושבה"}
              </button>
              {nAssigned > 0 && (
                <button
                  className={[base.btnSm, base.btnDanger].join(" ")}
                  onClick={clearAll}
                >
                  נקה הכל
                </button>
              )}
              <button
                className={[base.btnSm, base.btnGhost, styles.undoBtn].join(" ")}
                onClick={undo}
                disabled={seatingHistory.length === 0}
                title={seatingHistory.length > 0 ? "בטל שינוי הושבה אחרון (" + seatingHistory.length + " זמינים)" : "אין שינויים לביטול"}
              >
                ↩ בטל
              </button>
              <button
                className={[base.btnSm, base.btnGhost, styles.printBtn].join(" ")}
                onClick={() => window.print()}
                title="הדפס / ייצוא סידור הושבה"
              >
                🖨 הדפס / ייצוא
              </button>
              <button
                className={[base.btnSm, styles.xlsBtn].join(" ")}
                onClick={() => exportToExcel(ev, sideLabel, violations)}
                title="ייצוא לקובץ אקסל"
                disabled={ev.guests.length === 0 && ev.tables.length === 0}
              >
                📊 ייצוא לאקסל
              </button>
            </div>
          </div>

          {allSeated && noProblems && (
            <div className={styles.successCard}>
              <div className={styles.successIconWrap}>✓</div>
              <div>
                <div className={styles.successTitle}>הושבה מלאה וללא הפרות 🎉</div>
                <div className={styles.successSub}>
                  כל {ev.guests.length} האורחים שובצו בהצלחה ל{ev.tables.length} שולחנות.
                </div>
              </div>
            </div>
          )}

          {violations.length > 0 && (
            <div className={styles.violCard}>
              <div className={styles.violHeader}>
                <span className={styles.violTitle}>
                  ⚠ {violations.length} {violations.length === 1 ? "הפרה" : "הפרות"} בסידור הנוכחי
                </span>
                <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={runAuto}>חשב מחדש</button>
              </div>
              <p className={styles.violExplain}>
                האילוצים הבאים לא מתקיימים — ניתן לתקן אוטומטית באמצעות "חשב מחדש", או להעביר אורחים ידנית.
              </p>
              <div className={styles.violList}>
                {violations.map((v, i) => (
                  <div
                    key={i}
                    className={[
                      styles.violRow,
                      v.type === "capacity" ? styles.violCap : v.type === "apart" ? styles.violApart : styles.violTog
                    ].join(" ")}
                  >
                    <span className={styles.violIcon}>
                      {v.type === "capacity" ? "🔴" : v.type === "apart" ? "⛔" : "🤝"}
                    </span>
                    <span>{v.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unassigned.length > 0 && (
            <DroppableWrapper id="unassigned">
              {({ ref, isOver: isDragOver }) => (
                <div
                  ref={ref}
                  className={[
                    styles.unassignedCard,
                    activeId && !isDragOver ? styles.unassignedDropReady : "",
                    isDragOver ? styles.unassignedDropActive : "",
                  ].filter(Boolean).join(" ")}
                >
                  <div className={styles.unassignedHeader}>
                    <span className={styles.unassignedTitle}>⏳ ממתינים לשיבוץ</span>
                    <span className={styles.unassignedCount}>{unassigned.length} אורחים</span>
                  </div>
                  <p className={styles.unassignedHint}>
                    גררו אורח לשולחן, או בחרו שולחן מהרשימה. לסידור חדש של כולם — לחצו "חשב מחדש" למעלה.
                  </p>
                  <div className={base.gList}>
                    {unassigned.map(g => (
                      <DraggableGuestRow key={g.id} guestId={g.id} className={base.gRow}>
                        <SideDot side={g.side} />
                        <div className={base.gInfo}>
                          <span className={base.gName}>{g.name}</span>
                          <span className={base.gMeta}>{sideLabel(g.side)} · {g.group}</span>
                        </div>
                        <select
                          className={base.select}
                          style={{ minWidth: 180, fontSize: 13 }}
                          value=""
                          onPointerDown={e => e.stopPropagation()}
                          onChange={e => { if (e.target.value) assignGuest(g.id, e.target.value); }}
                        >
                          <option value="">שבץ לשולחן...</option>
                          {ev.tables.map(t => {
                            const seats = tableSeats(t.id);
                            const full  = seats + (g.count || 1) > t.capacity;
                            return (
                              <option key={t.id} value={t.id} disabled={full}>
                                {t.name} ({seats}/{t.capacity}){full ? " — מלא" : ""}
                              </option>
                            );
                          })}
                        </select>
                      </DraggableGuestRow>
                    ))}
                  </div>
                </div>
              )}
            </DroppableWrapper>
          )}

          {ev.tables.length > 0 && (
            <div className={[styles.tableCards, activeId ? styles.tableCardsDragging : ""].filter(Boolean).join(" ")}>
              {ev.tables.map(t => {
                const tGuests    = tableGuests(t.id);
                const usedSeats  = tGuests.reduce((s, g) => s + (g.count || 1), 0);
                const isCapOver  = usedSeats > t.capacity;
                const hasViol    = violatedTables.has(t.name);
                const isExpanded = expandedTable === t.id;
                const pct        = t.capacity > 0 ? usedSeats / t.capacity : 0;
                const borderCol  = isCapOver ? "var(--red)" : hasViol ? "#E8A020" : "var(--border)";

                return (
                  <DroppableWrapper key={t.id} id={"table-" + t.id}>
                    {({ ref, isOver: isDragOver }) => (
                      <div
                        ref={ref}
                        className={styles.tCard}
                        style={{
                          borderColor: isDragOver ? "var(--accent)" : borderCol,
                          background:  isDragOver ? "var(--accent-bg)" : (isCapOver ? "#FFFBFB" : undefined),
                        }}
                      >
                        <button className={styles.tCardHead} onClick={() => setExpandedTable(isExpanded ? null : t.id)}>
                          <div className={styles.tCardLeft}>
                            <span className={styles.tCardIcon} style={tGuests.length === 0 ? { opacity: 0.25 } : undefined}>⬡</span>
                            <div>
                              <div className={styles.tCardName}>
                                {t.name}
                                {t.type !== "regular" && <TypeTag type={t.type} />}
                                {isCapOver             && <span className={styles.tCardBadgeRed}>חריגה!</span>}
                                {hasViol && !isCapOver && <span className={styles.tCardBadgeWarn}>הפרה</span>}
                              </div>
                              {tGuests.length === 0 && (
                                <div className={styles.tCardEmpty}>{t.capacity} מקומות פנויים</div>
                              )}
                              {tGuests.length > 0 && (
                                <div className={styles.tChipRow}>
                                  {["bride", "groom"].map(side => {
                                    const n = tGuests.filter(g => g.side === side).length;
                                    if (!n) return null;
                                    return (
                                      <span
                                        key={side}
                                        className={[styles.tChip, side === "bride" ? styles.tChipBride : styles.tChipGroom].join(" ")}
                                      >
                                        <SideDot side={side} /> {n}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className={styles.tCardRight}>
                            <CapBar filled={usedSeats} capacity={t.capacity} isOver={isCapOver} />
                            <span
                              className={styles.tCardCount}
                              style={{
                                color: isCapOver ? "var(--red)" : pct > 0.85 ? "var(--warn)" : usedSeats > 0 ? "var(--text)" : "var(--muted)"
                              }}
                            >
                              {usedSeats}/{t.capacity}
                              <span className={styles.tCardCapLabel}> מקומות</span>
                            </span>
                            <span className={styles.tCardChevron}>{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className={styles.tGuestList}>
                            {tGuests.length === 0 && (
                              <span className={styles.emptyInline}>שולחן ריק — גרור אורח לכאן, או בחר מהממתינים</span>
                            )}
                            {tGuests.map(g => (
                              <DraggableGuestRow key={g.id} guestId={g.id} className={styles.tGuestRow}>
                                <SideDot side={g.side} />
                                <div className={base.gInfo} style={{ flex: 1 }}>
                                  <span className={base.gName}>{g.name}</span>
                                  <span className={base.gMeta}>{g.group}</span>
                                </div>
                                <select
                                  className={base.select}
                                  style={{ minWidth: 160, fontSize: 13 }}
                                  value={t.id}
                                  onPointerDown={e => e.stopPropagation()}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === "__remove__") assignGuest(g.id, null);
                                    else if (val !== t.id)   assignGuest(g.id, val);
                                  }}
                                >
                                  <option value={t.id}>{t.name} (כאן)</option>
                                  <option value="__remove__">↩ הסר מהשולחן</option>
                                  <optgroup label="העבר לשולחן אחר">
                                    {ev.tables.filter(ot => ot.id !== t.id).map(ot => {
                                      const seats = tableSeats(ot.id);
                                      const full  = seats + (g.count || 1) > ot.capacity;
                                      return (
                                        <option key={ot.id} value={ot.id} disabled={full}>
                                          {ot.name} ({seats}/{ot.capacity}){full ? " — מלא" : ""}
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                </select>
                              </DraggableGuestRow>
                            ))}

                            {unassigned.length > 0 && usedSeats < t.capacity && (
                              <div
                                className={styles.tGuestRow}
                                style={{ borderTop: "1px dashed var(--border)", marginTop: 6, paddingTop: 10 }}
                              >
                                <span className={base.gMeta} style={{ flex: 1, color: "var(--text2)" }}>הוסף אורח לשולחן זה:</span>
                                <select
                                  className={base.select}
                                  style={{ minWidth: 180, fontSize: 13 }}
                                  value=""
                                  onChange={e => { if (e.target.value) assignGuest(e.target.value, t.id); }}
                                >
                                  <option value="">— בחר מהממתינים —</option>
                                  {unassigned.map(g => (
                                    <option key={g.id} value={g.id}>{g.name} ({sideLabel(g.side)})</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </DroppableWrapper>
                );
              })}
            </div>
          )}
        </div>

        <DragOverlay>
          {activeGuest ? (
            <div className={styles.dragOverlayRow}>
              <SideDot side={activeGuest.side} />
              <span className={styles.dragOverlayName}>{activeGuest.name}</span>
              <span className={styles.dragOverlayMeta}>{sideLabel(activeGuest.side)}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Print-only view ─────────────────────────────────────────────────
          Hidden on screen via display:none. @media print swaps visibility:
          hides .screenContent, shows .printView.
      ─────────────────────────────────────────────────────────────────── */}
      <div className={styles.printView}>
        <div className={styles.pvHeader}>
          <div className={styles.pvBrand}>כוכב השולחן</div>
          <h1 className={styles.pvTitle}>{ev.name}</h1>
          {(ev.date || ev.venue) && (
            <p className={styles.pvMeta}>
              {ev.date && <span>{fmtDate(ev.date)}</span>}
              {ev.date && ev.venue && <span> · </span>}
              {ev.venue && <span>{ev.venue}</span>}
            </p>
          )}
          <p className={styles.pvStats}>
            {nAssigned}/{ev.guests.length} אורחים שובצו · {ev.tables.length} שולחנות · {totalCap} מקומות באולם
          </p>
        </div>

        <hr className={styles.pvDivider} />

        {violations.length > 0 && (
          <div className={styles.pvViolWarn}>
            ⚠ שים לב: {violations.length} {violations.length === 1 ? "הפרה" : "הפרות"} אילוצים בסידור הנוכחי
          </div>
        )}

        {ev.tables.length > 0 ? (
          <div className={styles.pvGrid}>
            {ev.tables.map(t => {
              const tg      = tableGuests(t.id);
              const tgSeats = tg.reduce((s, g) => s + (g.count || 1), 0);
              const capOver = tgSeats > t.capacity;
              return (
                <div key={t.id} className={[styles.pvTable, capOver ? styles.pvTableOver : ""].filter(Boolean).join(" ")}>
                  <div className={styles.pvTableHead}>
                    <span className={styles.pvTableName}>{t.name}</span>
                    <span className={styles.pvTableCount}>{tgSeats}/{t.capacity}{capOver ? " ⚠" : ""}</span>
                  </div>
                  <div className={styles.pvTableBody}>
                    {tg.length === 0
                      ? <span className={styles.pvEmpty}>שולחן ריק</span>
                      : tg.map(g => (
                          <div key={g.id} className={styles.pvGuest}>
                            <span className={styles.pvGuestName}>{g.name}</span>
                            <span className={styles.pvGuestMeta}>
                              {sideLabel(g.side)}{g.group ? " · " + g.group : ""}
                            </span>
                          </div>
                        ))
                    }
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={styles.pvEmpty} style={{ marginBottom: 12 }}>לא הוגדרו שולחנות</p>
        )}

        {unassigned.length > 0 && (
          <div className={styles.pvUnassigned}>
            <div className={styles.pvUnassignedTitle}>⏳ ממתינים לשיבוץ ({unassigned.length})</div>
            <div className={styles.pvUnassignedList}>
              {unassigned.map(g => (
                <span key={g.id} className={styles.pvUnassignedGuest}>
                  {g.name} — {sideLabel(g.side)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={styles.pvFooter}>
          הופק באמצעות כוכב השולחן · {new Date().toLocaleDateString("he-IL")}
        </div>
      </div>
    </>
  );
}
