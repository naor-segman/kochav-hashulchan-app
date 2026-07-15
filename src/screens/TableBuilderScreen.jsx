import { useState } from "react";
import { TABLE_TYPES } from "../data/constants.js";
import { uid } from "../utils/uid.js";
import Banner from "../components/feedback/Banner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import TypeTag from "../components/ui/TypeTag.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./TableBuilderScreen.module.css";

export default function TableBuilderScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [batch, setBatch]       = useState({ prefix: "", capacity: "10", count: "1", type: "regular" });
  const [editId, setEditId]     = useState(null);
  const [editVals, setEditVals] = useState({});

  const totalCap       = ev.tables.reduce((s, t) => s + t.capacity, 0);
  const totalGuestSeats = ev.guests.reduce((s, g) => s + (g.count || 1), 0);
  const gap            = totalCap - totalGuestSeats;
  const batchCnt    = Math.max(1, parseInt(batch.count)    || 0);
  const batchCap    = Math.max(1, parseInt(batch.capacity) || 0);
  const batchTotal  = batchCnt * batchCap;
  const nextIdx     = ev.tables.length + 1;
  const previewPrefix = batch.prefix.trim() || "שולחן";

  const previewNames = Array.from({ length: Math.min(batchCnt, 3) }, (_, i) =>
    previewPrefix + " " + (nextIdx + i)
  ).join(", ");

  const addBatch = () => {
    const cap = parseInt(batch.capacity);
    const cnt = parseInt(batch.count);
    if (!cap || cap < 1) { showToast("יש להזין מספר מקומות תקני", "err"); return; }
    if (!cnt || cnt < 1) { showToast("יש להזין כמות שולחנות תקנית", "err"); return; }
    patchEvent(e => {
      const rows = Array.from({ length: cnt }, (_, i) => ({
        id:       uid(),
        name:     previewPrefix + " " + (e.tables.length + i + 1),
        capacity: cap,
        type:     batch.type,
      }));
      return Object.assign({}, e, { tables: e.tables.concat(rows) });
    });
    showToast("נוספו " + (cnt === 1 ? "שולחן אחד" : cnt + " שולחנות") + " (" + batchTotal + " מקומות) ✓");
    setBatch(p => Object.assign({}, p, { prefix: "", count: "1" }));
  };

  const startEdit  = t  => { setEditId(t.id); setEditVals({ name: t.name, capacity: String(t.capacity), type: t.type }); };
  const cancelEdit = () => setEditId(null);
  const saveEdit   = () => {
    const cap = parseInt(editVals.capacity);
    if (!editVals.name.trim()) { showToast("שם השולחן לא יכול להיות ריק", "err"); return; }
    if (!cap || cap < 1)       { showToast("קיבולת לא תקנית", "err"); return; }
    patchEvent(e => Object.assign({}, e, {
      tables: e.tables.map(t => t.id === editId
        ? Object.assign({}, t, { name: editVals.name.trim(), capacity: cap, type: editVals.type })
        : t
      )
    }));
    setEditId(null);
    showToast("השולחן עודכן ✓");
  };

  const delTable = id => {
    const t     = ev.tables.find(t => t.id === id);
    const tName = t ? t.name : "";
    const cnt   = ev.guests
      .filter(g => ev.seating[g.id] === id)
      .reduce((s, g) => s + (g.count || 1), 0);
    const msg   = cnt > 0
      ? "למחוק את השולחן \"" + tName + "\"?\n\n" +
        cnt + " מקומות שובצו לשולחן זה — הרשומות יחזרו לרשימת הממתינים.\n\nפעולה זו אינה ניתנת לביטול."
      : "למחוק את השולחן \"" + tName + "\"?\n\nהשולחן ריק. פעולה זו אינה ניתנת לביטול.";
    if (!confirm(msg)) return;
    patchEvent(e => Object.assign({}, e, {
      tables:  e.tables.filter(t => t.id !== id),
      seating: Object.fromEntries(Object.entries(e.seating).filter(([, tid]) => tid !== id)),
    }));
    showToast("השולחן \"" + tName + "\" נמחק");
  };

  return (
    <div className={base.page}>
      <PageHeader
        title="שולחנות"
        icon="⬡"
        sub="הגדר את השולחנות באולם לפי מבנה האירוע."
        aside={
          <div className={base.pills}>
            <StatPill n={ev.tables.length} label="שולחנות" />
            <StatPill n={totalCap} label="מקומות" color={gap < 0 ? "var(--red)" : undefined} />
          </div>
        }
      />

      <div className={styles.stepGuide}>
        <span className={styles.stepBadge}>שלב 2 מתוך 5 — שולחנות</span>
        <span className={styles.stepText}>הגדירו כמה שולחנות יש באולם ומה הקיבולת שלהם. לאחר מכן המשיכו לרשימת האורחים. כל שינוי נשמר אוטומטית.</span>
      </div>

      {gap < 0 && totalGuestSeats > 0 && (
        <Banner variant="warn">
          חסרים {Math.abs(gap)} מקומות — יש יותר מקומות לאורחים ({totalGuestSeats}) ממקומות פנויים ({totalCap}).
        </Banner>
      )}
      {gap > 0 && ev.tables.length > 0 && totalGuestSeats > 0 && (
        <Banner variant="ok">{gap} מקומות פנויים מעבר לכמות מקומות האורחים ({totalGuestSeats}).</Banner>
      )}

      <div className={base.card}>
        <SectionLabel>הוספת שולחנות</SectionLabel>
        <p className={styles.batchHint}>ניתן להוסיף כמה שולחנות בבת אחת — כולם יקבלו את אותה קיבולת וסוג. לשמות ייווצרו אוטומטית מספרים רצופים.</p>
        <div className={base.batchGrid}>
          <Field label="שם / קידומת" hint="לדוגמה: שולחן, אביר">
            <input
              className={base.input}
              value={batch.prefix}
              placeholder="שולחן"
              onChange={e => setBatch(p => Object.assign({}, p, { prefix: e.target.value }))}
            />
          </Field>
          <Field label="מקומות לשולחן">
            <input className={base.input} type="number" min="1" max="100" value={batch.capacity}
              onChange={e => setBatch(p => Object.assign({}, p, { capacity: e.target.value }))} />
          </Field>
          <Field label="כמות שולחנות">
            <input className={base.input} type="number" min="1" max="200" value={batch.count}
              onChange={e => setBatch(p => Object.assign({}, p, { count: e.target.value }))} />
          </Field>
          <Field label="סוג">
            <select className={base.select} value={batch.type} onChange={e => setBatch(p => Object.assign({}, p, { type: e.target.value }))}>
              {TABLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>

        {batchTotal > 0 && (
          <div className={base.batchPreview}>
            <span style={{ color: "var(--accent)", flexShrink: 0 }}>⬡</span>
            <span>
              {batchCnt === 1
                ? ("יתווסף שולחן אחד: " + previewNames + " (" + batchCap + " מקומות)")
                : ("יתווספו " + batchCnt + " שולחנות: " + previewNames + (batchCnt > 3 ? "..." : "") + " (" + batchCap + " מקומות כ\"א)")}
              {" · סה\"כ לאחר ההוספה: "}
              <strong>{totalCap + batchTotal} מקומות</strong>
            </span>
          </div>
        )}

        <div className={base.formActions}>
          <button className={base.btnPrimary} onClick={addBatch}>
            + הוסף {batchCnt > 1 ? (batchCnt + " שולחנות") : "שולחן"}
          </button>
        </div>
      </div>

      {ev.tables.length > 0 && (
        <div className={base.card}>
          <SectionLabel>השולחנות שלי ({ev.tables.length})</SectionLabel>
          {totalCap > 0 && totalGuestSeats === 0 && (
            <p className={styles.capStat}>קיבולת כוללת: {totalCap} מקומות</p>
          )}
          {totalCap > 0 && totalGuestSeats > 0 && gap < 0 && (
            <p className={styles.capStatWarn}>
              חסרים {Math.abs(gap)} מקומות — {totalGuestSeats} מקומות לאורחים, {totalCap} מקומות זמינים בלבד
            </p>
          )}
          {totalCap > 0 && totalGuestSeats > 0 && gap >= 0 && (
            <p className={styles.capStatOk}>
              קיבולת מספיקה — {totalGuestSeats} מקומות לאורחים, {gap} פנויים מתוך {totalCap}
            </p>
          )}
          <div className={base.tableGrid}>
            <div className={[base.tRow, base.tHead].join(" ")}>
              <span>שם השולחן</span>
              <span style={{ textAlign: "center" }}>מקומות</span>
              <span style={{ textAlign: "center" }}>סוג</span>
              <span style={{ textAlign: "center" }}>מושבצים</span>
              <span />
            </div>
            {ev.tables.map(t => {
              const seated = ev.guests
                .filter(g => ev.seating[g.id] === t.id)
                .reduce((s, g) => s + (g.count || 1), 0);
              const isEdit = editId === t.id;
              const isOver = seated > t.capacity;
              const pct    = t.capacity > 0 ? seated / t.capacity : 0;
              return (
                <div key={t.id} className={[base.tRow, isEdit ? base.tRowEdit : ""].filter(Boolean).join(" ")}>
                  {isEdit ? (
                    <>
                      <input
                        className={base.input}
                        value={editVals.name}
                        autoFocus
                        onChange={e => setEditVals(p => Object.assign({}, p, { name: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                      <input
                        className={base.input}
                        style={{ textAlign: "center" }}
                        type="number"
                        min="1"
                        value={editVals.capacity}
                        onChange={e => setEditVals(p => Object.assign({}, p, { capacity: e.target.value }))}
                      />
                      <select
                        className={base.select}
                        value={editVals.type}
                        onChange={e => setEditVals(p => Object.assign({}, p, { type: e.target.value }))}
                      >
                        {TABLE_TYPES.map(tp => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
                      </select>
                      <span />
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className={base.btnSm} onClick={saveEdit}>שמור</button>
                        <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={cancelEdit}>ביטול</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                      <span style={{ textAlign: "center" }}>{t.capacity}</span>
                      <span style={{ textAlign: "center" }}><TypeTag type={t.type} /></span>
                      <span style={{
                        textAlign: "center",
                        fontWeight: seated > 0 ? 700 : 400,
                        color: isOver ? "var(--red)" : pct > 0.85 ? "var(--warn)" : seated > 0 ? "var(--green)" : "var(--muted)"
                      }}>
                        {seated}/{t.capacity}
                      </span>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => startEdit(t)}>עריכה</button>
                        <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delTable(t.id)}>מחק</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ev.tables.length === 0 && (
        <EmptyState icon="⬡" title="טרם הוגדרו שולחנות"
          text='השתמשו בטופס למעלה כדי להוסיף שולחנות. לדוגמה: 15 שולחנות עגולים עם 10 מקומות כל אחד — הכניסו 15 בשדה "כמות" ו-10 בשדה "מקומות".' />
      )}

      <NextStep
        label="המשך לרשימת האורחים"
        hint={ev.guests.length > 0 ? (ev.guests.length + " אורחים רשומים") : "עדיין לא נוספו אורחים"}
        onClick={() => go("guests")}
      />
    </div>
  );
}
