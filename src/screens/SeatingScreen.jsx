import { useState, useMemo } from "react";
import { autoAssign, computeViolations } from "../logic/seating.js";
import Banner from "../components/feedback/Banner.jsx";
import CapBar from "../components/ui/CapBar.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SideDot from "../components/ui/SideDot.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import TypeTag from "../components/ui/TypeTag.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./SeatingScreen.module.css";

export default function SeatingScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [expandedTable, setExpandedTable] = useState(null);

  const violations = useMemo(() =>
    computeViolations(ev.guests, ev.tables, ev.constraints, ev.seating),
    [ev.guests, ev.tables, ev.constraints, ev.seating]
  );

  const unassigned      = ev.guests.filter(g => !ev.seating[g.id]);
  const nAssigned       = ev.guests.filter(g => ev.seating[g.id]).length;
  const nAssignedSeats  = ev.guests.filter(g => ev.seating[g.id]).reduce((s, g) => s + (g.count || 1), 0);
  const totalSeats      = ev.guests.reduce((s, g) => s + (g.count || 1), 0);
  const totalCap        = ev.tables.reduce((s, t) => s + t.capacity, 0);
  const allSeated       = nAssigned === ev.guests.length && ev.guests.length > 0;
  const noProblems      = violations.length === 0;
  const noTables        = ev.tables.length === 0;
  const noGuests        = ev.guests.length === 0;

  const sideLabel       = s => s === "bride" ? (ev.brideName ? "צד " + ev.brideName : "צד כלה") : (ev.groomName ? "צד " + ev.groomName : "צד חתן");
  const tableGuests     = tid => ev.guests.filter(g => ev.seating[g.id] === tid);

  const violatedTables  = new Set(
    violations.flatMap(v => [v.tableA, v.tableB]).filter(Boolean)
  );

  const runAuto = () => {
    if (noTables) { showToast("יש להגדיר שולחנות תחילה", "err"); return; }
    if (noGuests) { showToast("יש להוסיף אורחים תחילה", "err"); return; }
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
    if (!confirm("לנקות את כל שיבוצי ההושבה?\n" + nAssigned + " אורחים יחזרו לרשימת הממתינים.")) return;
    patchEvent(e => Object.assign({}, e, { seating: {} }));
    showToast("כל השיבוצים נוקו");
    setExpandedTable(null);
  };

  const assignGuest = (guestId, tableId) => {
    patchEvent(e => {
      const s = Object.assign({}, e.seating);
      if (!tableId) delete s[guestId];
      else s[guestId] = tableId;
      return Object.assign({}, e, { seating: s });
    });
  };

  return (
    <div className={base.page}>
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

      <div className={base.actionBar}>
        <button
          className={base.btnPrimary}
          style={noTables || noGuests ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
          onClick={runAuto}
          disabled={noTables || noGuests}
        >
          ✦ חשב הושבה אוטומטית
        </button>
        {nAssigned > 0 && (
          <button
            className={base.btnSecondary}
            style={{ color: "var(--red)", borderColor: "var(--red-border)" }}
            onClick={clearAll}
          >
            נקה הכל
          </button>
        )}
        <span className={base.fieldHint}>
          {nAssignedSeats} / {totalSeats} מקומות שובצו ({nAssigned}/{ev.guests.length} רשומות) · {totalCap} כסאות באולם
        </span>
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
        <div className={styles.unassignedCard}>
          <div className={styles.unassignedHeader}>
            <span className={styles.unassignedTitle}>⏳ ממתינים לשיבוץ</span>
            <span className={styles.unassignedCount}>{unassigned.length} אורחים</span>
          </div>
          <div className={base.gList}>
            {unassigned.map(g => (
              <div key={g.id} className={base.gRow}>
                <SideDot side={g.side} />
                <div className={base.gInfo}>
                  <span className={base.gName}>{g.name}</span>
                  <span className={base.gMeta}>{sideLabel(g.side)} · {g.group}</span>
                </div>
                <select
                  className={base.select}
                  style={{ minWidth: 180, fontSize: 13 }}
                  value=""
                  onChange={e => { if (e.target.value) assignGuest(g.id, e.target.value); }}
                >
                  <option value="">שבץ לשולחן...</option>
                  {ev.tables.map(t => {
                    const cnt  = tableGuests(t.id).length;
                    const full = cnt >= t.capacity;
                    return (
                      <option key={t.id} value={t.id} disabled={full}>
                        {t.name} ({cnt}/{t.capacity}){full ? " — מלא" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {ev.tables.length > 0 && (
        <div className={styles.tableCards}>
          {ev.tables.map(t => {
            const tGuests    = tableGuests(t.id);
            const isOver     = tGuests.length > t.capacity;
            const hasViol    = violatedTables.has(t.name);
            const isExpanded = expandedTable === t.id;
            const pct        = t.capacity > 0 ? tGuests.length / t.capacity : 0;
            const borderCol  = isOver ? "var(--red)" : hasViol ? "#E8A020" : "var(--border)";

            return (
              <div
                key={t.id}
                className={styles.tCard}
                style={{ borderColor: borderCol, ...(isOver ? { background: "#FFFBFB" } : {}) }}
              >
                <button className={styles.tCardHead} onClick={() => setExpandedTable(isExpanded ? null : t.id)}>
                  <div className={styles.tCardLeft}>
                    <span className={styles.tCardIcon} style={tGuests.length === 0 ? { opacity: 0.25 } : undefined}>⬡</span>
                    <div>
                      <div className={styles.tCardName}>
                        {t.name}
                        {t.type !== "regular" && <TypeTag type={t.type} />}
                        {isOver  && <span className={styles.tCardBadgeRed}>חריגה!</span>}
                        {hasViol && !isOver && <span className={styles.tCardBadgeWarn}>הפרה</span>}
                      </div>
                      {tGuests.length > 0 && (
                        <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                          {["bride", "groom"].map(side => {
                            const n = tGuests.filter(g => g.side === side).length;
                            if (!n) return null;
                            return (
                              <span
                                key={side}
                                className={styles.tChip}
                                style={{
                                  color:      side === "bride" ? "var(--bride)" : "var(--groom)",
                                  background: side === "bride" ? "#F5ECF3" : "#EBF2FB",
                                  border:     "1px solid " + (side === "bride" ? "#E0C6DB" : "#C5D9F0"),
                                }}
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
                    <CapBar filled={tGuests.length} capacity={t.capacity} isOver={isOver} />
                    <span
                      className={styles.tCardCount}
                      style={{
                        color: isOver ? "var(--red)" : pct > 0.85 ? "var(--warn)" : tGuests.length > 0 ? "var(--text)" : "var(--muted)"
                      }}
                    >
                      {tGuests.length}/{t.capacity}
                    </span>
                    <span className={styles.tCardChevron}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className={styles.tGuestList}>
                    {tGuests.length === 0 && (
                      <span className={styles.emptyInline}>שולחן ריק — הוסף אורחים מהרשימה למטה</span>
                    )}
                    {tGuests.map(g => (
                      <div key={g.id} className={styles.tGuestRow}>
                        <SideDot side={g.side} />
                        <div className={base.gInfo} style={{ flex: 1 }}>
                          <span className={base.gName}>{g.name}</span>
                          <span className={base.gMeta}>{g.group}</span>
                        </div>
                        <select
                          className={base.select}
                          style={{ minWidth: 160, fontSize: 13 }}
                          value={t.id}
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
                              const cnt  = tableGuests(ot.id).length;
                              const full = cnt >= ot.capacity;
                              return (
                                <option key={ot.id} value={ot.id} disabled={full}>
                                  {ot.name} ({cnt}/{ot.capacity}){full ? " — מלא" : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        </select>
                      </div>
                    ))}

                    {unassigned.length > 0 && !isOver && (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
