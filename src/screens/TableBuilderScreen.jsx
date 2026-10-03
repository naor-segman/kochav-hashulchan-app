import { useState } from "react";
import Icon from "../components/ui/Icon.jsx";
import { TABLE_TYPES, TABLE_SHAPES, DEFAULT_TABLE_SHAPE } from "../data/constants.js";
import { uid } from "../utils/uid.js";
import { seatingTotals } from "../utils/eventHelpers.js";
import Banner from "../components/feedback/Banner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import InfoTip from "../components/ui/InfoTip.jsx";
import FloorPlanEditor from "../components/floorplan/FloorPlanEditor.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import { buildStep, nextBuildStep, BUILD_STEP_COUNT } from "../data/eventAreas.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import TypeTag from "../components/ui/TypeTag.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./TableBuilderScreen.module.css";
import { nextTableNames } from "../utils/tableNames.js";

const TABS = [
  { id: "list",      label: "רשימת שולחנות", icon: "hexagon" },
  { id: "floorplan", label: "מפת אולם (רשות)", icon: "building" },
];

// The inputs' own min/max, enforced: the HTML attributes only colour the field.
const BATCH_MAX_COUNT    = 200;
const BATCH_MAX_CAPACITY = 100;

export default function TableBuilderScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  // Position in the build order, from src/data/eventAreas.js — never a literal.
  const step = buildStep("tables");
  const next = nextBuildStep("tables");

  const { confirm, prompt, dialog } = useConfirm();
  const [tab,     setTab]     = useState("list");
  const [batch,   setBatch]   = useState({ prefix: "", capacity: "10", count: "1", type: "regular", shape: DEFAULT_TABLE_SHAPE });
  const [editId,  setEditId]  = useState(null);
  const [editVals,setEditVals]= useState({});

  // Table types = the standard set + any custom types the user created for this
  // event, plus an "add custom" sentinel that prompts for a new one.
  const customTypes  = ev.customTableTypes || [];
  const LEGACY_TYPE_LABELS = { head: "שולחן ראשי" };
  const knownTypeValues = new Set([...TABLE_TYPES.map(s => s.value), ...customTypes]);
  // Any type already stored on a table but missing from the standard+custom sets
  // (a legacy "head", or a custom type not in the registry) still needs an
  // option, or the controlled <select> renders blank for that table.
  const inUseExtraTypes = Array.from(new Set(ev.tables.map(t => t.type).filter(Boolean)))
    .filter(t => !knownTypeValues.has(t));
  const typeOptions  = [
    ...TABLE_TYPES,
    ...customTypes
      .filter(t => !TABLE_TYPES.some(s => s.value === t))
      .map(t => ({ value: t, label: t })),
    ...inUseExtraTypes.map(t => ({ value: t, label: LEGACY_TYPE_LABELS[t] || t })),
  ];
  const chooseType = async (value, apply) => {
    if (value === "__add__") {
      const name = (await prompt("שם סוג השולחן המותאם (למשל: שולחן ילדים)", {
        placeholder: "שם הסוג",
        confirmLabel: "צרו סוג",
      }) || "").trim();
      if (!name) return;
      if (!TABLE_TYPES.some(s => s.value === name) && !customTypes.includes(name)) {
        patchEvent(e => Object.assign({}, e, {
          customTableTypes: [...(e.customTableTypes || []), name],
        }));
      }
      apply(name);
    } else {
      apply(value);
    }
  };

  const totalCap       = ev.tables.reduce((s, t) => s + t.capacity, 0);
  // Declined guests need no chair. Summing them here said "חסרים 20 מקומות"
  // for an event the seating screen called 8 short (browser audit 28.9).
  const totalGuestSeats = seatingTotals(ev.guests, ev.seating).totalSeats;
  const gap            = totalCap - totalGuestSeats;
  // The preview used to clamp what it read to at least 1, so an empty or 0
  // capacity previewed "(1 מקומות)" for a batch the add button then refused —
  // and nothing capped the count: the inputs say max 200 / 100, but typing
  // 5000 created 5000 tables in one click (89). The preview, the button and
  // the add now read the same validated numbers.
  const capNum      = parseInt(batch.capacity, 10);
  const cntNum      = parseInt(batch.count, 10);
  const capOk       = capNum >= 1 && capNum <= BATCH_MAX_CAPACITY;
  const cntOk       = cntNum >= 1 && cntNum <= BATCH_MAX_COUNT;
  const batchCnt    = cntOk ? cntNum : 0;
  const batchCap    = capOk ? capNum : 0;
  const batchTotal  = batchCnt * batchCap;
  const previewPrefix = batch.prefix.trim() || "שולחן";

  // The same numbering the add uses. Counted from the table count, the preview
  // promised "רזרבה 7" and the table was saved as "רזרבה 1" (fourth review).
  const previewNames = nextTableNames(ev.tables, Math.min(batchCnt, 3), previewPrefix).join(", ");
  const seatsWord = (n) => (n === 1 ? "מקום אחד" : n + " מקומות");

  const addBatch = () => {
    const cap = batchCap;
    const cnt = batchCnt;
    if (!capOk) { showToast(`יש להזין מספר מקומות בין 1 ל-${BATCH_MAX_CAPACITY}`, "err"); return; }
    if (!cntOk) { showToast(`אפשר להוסיף בין 1 ל-${BATCH_MAX_COUNT} שולחנות בבת אחת`, "err"); return; }
    patchEvent(e => {
      const names = nextTableNames(e.tables, cnt, previewPrefix);
      const rows = names.map(name => ({
        id:       uid(),
        name,
        capacity: cap,
        type:     batch.type,
        shape:    batch.shape,
      }));
      return Object.assign({}, e, { tables: e.tables.concat(rows) });
    });
    showToast("נוספו " + (cnt === 1 ? "שולחן אחד" : cnt + " שולחנות") + " (" + seatsWord(batchTotal) + ") ✓");
    setBatch(p => Object.assign({}, p, { prefix: "", count: "1" }));
  };

  const startEdit  = t  => { setEditId(t.id); setEditVals({ name: t.name, capacity: String(t.capacity), type: t.type, shape: t.shape || DEFAULT_TABLE_SHAPE }); };
  const cancelEdit = () => setEditId(null);
  const saveEdit   = () => {
    const cap  = parseInt(editVals.capacity);
    const name = (editVals.name || "").trim();
    if (!name)           { showToast("שם השולחן לא יכול להיות ריק", "err"); return; }
    if (!cap || cap < 1) { showToast("קיבולת לא תקנית", "err"); return; }
    // Same guard the seating screen's inline rename applies. addBatch already
    // refuses to generate a duplicate name; editing one by hand could still
    // create it, and the WhatsApp message, the printed entry card and the
    // violation list all address a table BY NAME.
    if (ev.tables.some(t => t.id !== editId && (t.name || "").trim() === name)) {
      showToast("כבר קיים שולחן בשם \"" + name + "\" — בחרו שם אחר", "err");
      return;
    }
    patchEvent(e => Object.assign({}, e, {
      tables: e.tables.map(t => t.id === editId
        ? Object.assign({}, t, { name, capacity: cap, type: editVals.type, shape: editVals.shape || DEFAULT_TABLE_SHAPE })
        : t
      )
    }));
    setEditId(null);
    showToast("השולחן עודכן ✓");
  };

  const delTable = async id => {
    const t     = ev.tables.find(t => t.id === id);
    const tName = t ? t.name : "";
    const cnt   = ev.guests
      .filter(g => ev.seating[g.id] === id)
      .reduce((s, g) => s + (g.count || 1), 0);
    const msg   = cnt > 0
      ? "למחוק את השולחן \"" + tName + "\"?\n\n" +
        cnt + " מקומות שובצו לשולחן זה — הרשומות יחזרו לרשימת הממתינים.\n\nפעולה זו אינה ניתנת לביטול."
      : "למחוק את השולחן \"" + tName + "\"?\n\nהשולחן ריק. פעולה זו אינה ניתנת לביטול.";
    if (!await confirm(msg, { danger: true, confirmLabel: "מחקו שולחן" })) return;
    patchEvent(e => {
      const tables  = e.tables.filter(t => t.id !== id);
      const seating = Object.fromEntries(Object.entries(e.seating).filter(([, tid]) => tid !== id));
      const floorPlan = e.floorPlan
        ? { ...e.floorPlan, tablePositions: Object.fromEntries(Object.entries(e.floorPlan.tablePositions ?? {}).filter(([tid]) => tid !== id)) }
        : e.floorPlan;
      return Object.assign({}, e, { tables, seating, floorPlan });
    });
    showToast("השולחן \"" + tName + "\" נמחק");
  };

  return (
    <div className={base.page}>
      {dialog}
      <PageHeader
        title="שולחנות"
        mark="tables"
        sub="הגדירו את השולחנות באולם לפי מבנה האירוע."
        aside={
          <div data-tour="tables.counts" data-tour-fit className={base.pills}>
            <StatPill n={ev.tables.length} label="שולחנות" primary />
            <StatPill n={totalCap} label="מקומות" color={gap < 0 ? "var(--red)" : undefined} />
          </div>
        }
      />

      <div className={base.stepGuide}>
        {/* Read from the model, never spelled out. This badge said "שלב 2"
            and pointed at the guest list long after the order changed to put
            the list first — a literal cannot be re-ordered. */}
        <span className={base.stepBadge}>
          {"שלב " + step.num + " מתוך " + BUILD_STEP_COUNT + " — " + step.label}
        </span>
        <span className={base.stepText}>הגדירו כמה שולחנות יש באולם ומה הקיבולת שלהם. אחר כך ממשיכים לאילוצים. כל שינוי נשמר אוטומטית.</span>
      </div>

      {gap < 0 && totalGuestSeats > 0 && (
        <Banner variant="warn">
          חסרים {Math.abs(gap)} מקומות — יש יותר מקומות לאורחים ({totalGuestSeats}) ממקומות פנויים ({totalCap}).
        </Banner>
      )}
      {/* This was <Banner variant="ok"> — a green success band. Spare capacity
          is a measurement, not something the host achieved; the screen already
          says so loudly in amber when there is NOT enough. Neutral. */}
      {gap > 0 && ev.tables.length > 0 && totalGuestSeats > 0 && (
        <p className={styles.capNote}>{gap} מקומות פנויים מעבר לכמות מקומות האורחים ({totalGuestSeats}).</p>
      )}

      {/* ── Tabs ── */}
      <div data-tour="tables.tabs" className={styles.tabBar}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={[styles.tabBtn, tab === t.id ? styles.tabActive : ""].filter(Boolean).join(" ")}
            onClick={() => setTab(t.id)}
          >
            <span className={styles.tabIcon}><Icon name={t.icon} size={16} /></span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Table list ── */}
      {tab === "list" && (
        <>
          <div data-tour="tables.add" className={base.card}>
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
              <Field label={<>מקומות לשולחן <InfoTip text="כמה כיסאות יש סביב שולחן אחד — הקיבולת שלו. אורח שהוא משפחה נספר לפי מספר המקומות שהזנתם לו, כך שההושבה לא תחרוג מהקיבולת." /></>}>
                <input className={base.input} type="number" min="1" max={BATCH_MAX_CAPACITY} value={batch.capacity}
                  onChange={e => setBatch(p => Object.assign({}, p, { capacity: e.target.value }))} />
              </Field>
              <Field label="כמות שולחנות">
                <input className={base.input} type="number" min="1" max={BATCH_MAX_COUNT} value={batch.count}
                  onChange={e => setBatch(p => Object.assign({}, p, { count: e.target.value }))} />
              </Field>
              <Field label="סוג">
                <select className={base.select} value={batch.type} onChange={e => chooseType(e.target.value, v => setBatch(p => Object.assign({}, p, { type: v })))}>
                  {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  <option value="__add__">+ סוג מותאם…</option>
                </select>
              </Field>
              <Field label={<>צורה <InfoTip text="הצורה הפיזית של השולחן. מופיעה במפת האולם כדי שתזהו את הפריסה האמיתית — ולא משפיעה על הקיבולת." /></>}>
                <select className={base.select} value={batch.shape}
                  onChange={e => setBatch(p => Object.assign({}, p, { shape: e.target.value }))}>
                  {TABLE_SHAPES.map(sh => <option key={sh.value} value={sh.value}>{sh.glyph} {sh.label}</option>)}
                </select>
              </Field>
            </div>

            {batchTotal > 0 ? (
              <div className={base.batchPreview}>
                <span style={{ color: "var(--accent)", flexShrink: 0, display: "inline-flex" }}><Icon name="hexagon" size={15} /></span>
                <span>
                  {batchCnt === 1
                    ? ("יתווסף שולחן אחד: " + previewNames + " (" + seatsWord(batchCap) + ")")
                    : ("יתווספו " + batchCnt + " שולחנות: " + previewNames + (batchCnt > 3 ? "..." : "") + " (" + seatsWord(batchCap) + " כ\"א)")}
                  {" · סה\"כ לאחר ההוספה: "}
                  <strong>{seatsWord(totalCap + batchTotal)}</strong>
                </span>
              </div>
            ) : (
              <p className={styles.batchHint} role="status">
                {!capOk
                  ? `מקומות לשולחן: מספר בין 1 ל-${BATCH_MAX_CAPACITY}.`
                  : `כמות שולחנות: מספר בין 1 ל-${BATCH_MAX_COUNT}.`}
              </p>
            )}

            <div className={base.formActions}>
              <button className={base.btnPrimary} onClick={addBatch}>
                + הוסיפו {batchCnt > 1 ? (batchCnt + " שולחנות") : "שולחן"}
              </button>
            </div>
          </div>

          {ev.tables.length > 0 && (
            <div data-tour="tables.list" className={base.card}>
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
                <p className={styles.capStat}>
                  קיבולת מספיקה — {totalGuestSeats} מקומות לאורחים, {gap} פנויים מתוך {totalCap}
                </p>
              )}
              <div className={base.tableGrid}>
                <div className={[base.tRow, styles.tRowNamed, base.tHead].join(" ")}>
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
                    <div key={t.id} className={[base.tRow, styles.tRowNamed, isEdit ? base.tRowEdit : ""].filter(Boolean).join(" ")}>
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
                            onChange={e => chooseType(e.target.value, v => setEditVals(p => Object.assign({}, p, { type: v })))}
                          >
                            {typeOptions.map(tp => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
                            <option value="__add__">+ סוג מותאם…</option>
                          </select>
                          <select
                            className={base.select}
                            aria-label="צורת השולחן"
                            value={editVals.shape || DEFAULT_TABLE_SHAPE}
                            onChange={e => setEditVals(p => Object.assign({}, p, { shape: e.target.value }))}
                          >
                            {TABLE_SHAPES.map(sh => <option key={sh.value} value={sh.value}>{sh.glyph} {sh.label}</option>)}
                          </select>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button className={base.btnSm} onClick={saveEdit}>שמרו</button>
                            <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={cancelEdit}>ביטול</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className={styles.rowName}>
                            {/* The ● that used to sit here said which shape the
                                table is and nothing else. The glyph says the
                                shape AND how full it is, in the same space. */}
                            <TableGlyph shape={t.shape} capacity={t.capacity} taken={seated} size={26} />
                            <span className={styles.rowNameText} title={t.name}>{t.name}</span>
                          </span>
                          <span style={{ textAlign: "center" }}>{t.capacity}</span>
                          <span style={{ textAlign: "center" }}><TypeTag type={t.type} /></span>
                          {/* Every occupied table used to print its count in
                              --green, so "3/12" — a table two-thirds empty —
                              was drawn in the colour this system reserves for
                              "בוצע". This is now exactly the rule the seating
                              cards use: ink while filling, amber near capacity,
                              red over it. */}
                          <span style={{
                            textAlign: "center",
                            fontWeight: seated > 0 ? 700 : 400,
                            color: isOver ? "var(--red)" : pct > 0.85 ? "var(--warn)" : seated > 0 ? "var(--text)" : "var(--muted)"
                          }}>
                            {seated}/{t.capacity}
                          </span>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={() => startEdit(t)}>עריכה</button>
                            <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delTable(t.id)}>מחקו</button>
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
            <EmptyState mark="tables" title="טרם הוגדרו שולחנות"
              text='השתמשו בטופס למעלה כדי להוסיף שולחנות. לדוגמה: 15 שולחנות עגולים עם 10 מקומות כל אחד — הכניסו 15 בשדה "כמות" ו-10 בשדה "מקומות".' />
          )}
        </>
      )}

      {/* ── Tab: Floor plan ── */}
      {tab === "floorplan" && (
        <div className={base.card}>
          <SectionLabel>מפת אולם — אופציונלי</SectionLabel>
          <p className={styles.floorPlanHint}>
            תכונה לרשות בלבד. אם קיבלתם סקיצה של האולם מהמקום — העלו אותה כאן,
            מקמו עליה את השולחנות, ותוכלו לגרור אורחים ישירות על גבי המפה. אין
            חובה — סידור ההושבה הרגיל נעשה במסך "הושבה".
          </p>
          <FloorPlanEditor ev={ev} patchEvent={patchEvent} showToast={showToast} />
        </div>
      )}

      <NextStep
        label={"המשיכו ל" + next.label}
        hint={ev.constraints.length === 0 ? "אופציונלי — מי חייב לשבת יחד ומי בשום אופן לא"
          : ev.constraints.length === 1 ? "אילוץ אחד מוגדר"
          : ev.constraints.length + " אילוצים מוגדרים"}
        onClick={() => go(next.id)}
      />
    </div>
  );
}
