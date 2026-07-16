import { useState, useMemo } from "react";
import { uid } from "../utils/uid.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./CostScreen.module.css";

const DEFAULT_CATEGORIES = [
  { name: "אולם ואירוח",    emoji: "🏛" },
  { name: "קייטרינג",       emoji: "🍽" },
  { name: "מוזיקה ודיג'יי", emoji: "🎵" },
  { name: "צלם ווידאו",     emoji: "📸" },
  { name: "פרחים ועיצוב",  emoji: "💐" },
  { name: "הזמנות",         emoji: "✉" },
  { name: "הלבשה",          emoji: "👗" },
  { name: "שונות",          emoji: "📋" },
];

function initCategories(ev) {
  const existing = ev?.costs?.categories;
  if (Array.isArray(existing) && existing.length > 0) return existing;
  return DEFAULT_CATEGORIES.map(c => ({
    id: uid(), name: c.name, emoji: c.emoji, budget: "", actual: "",
  }));
}

export default function CostScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [cats, setCats]  = useState(() => initCategories(ev));
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const setField = (id, field, value) => {
    setCats(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    setDirty(true);
  };

  const removeRow = (id) => {
    setCats(prev => prev.filter(c => c.id !== id));
    setDirty(true);
  };

  const addRow = () => {
    const name = newName.trim();
    if (!name) return;
    setCats(prev => [...prev, { id: uid(), name, emoji: "📋", budget: "", actual: "" }]);
    setNewName("");
    setAdding(false);
    setDirty(true);
  };

  const save = () => {
    patchEvent({ costs: { categories: cats } });
    setDirty(false);
    showToast("תקציב נשמר ✓");
  };

  const totalBudget = useMemo(() =>
    cats.reduce((s, c) => s + (parseFloat(c.budget) || 0), 0), [cats]);

  const totalActual = useMemo(() =>
    cats.reduce((s, c) => s + (parseFloat(c.actual) || 0), 0), [cats]);

  const totalGuests = ev?.guests?.reduce((s, g) => s + (g.count || 1), 0) || 0;
  const costPerGuest = totalGuests > 0 ? Math.round(totalActual / totalGuests) : 0;

  const fmtILS = (n) =>
    n > 0 ? "₪" + n.toLocaleString("he-IL", { maximumFractionDigits: 0 }) : "—";

  const diff = totalActual - totalBudget;

  return (
    <div className={base.page}>
      <PageHeader
        title="תקציב ועלויות"
        icon="📊"
        sub="עקוב אחר התקציב המתוכנן מול ההוצאה בפועל לאורך תכנון האירוע."
      />

      {/* ── Stats ── */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{fmtILS(totalBudget)}</span>
          <span className={styles.statLabel}>תקציב מתוכנן</span>
        </div>
        <div className={styles.stat}>
          <span className={[styles.statNum, totalActual > totalBudget && totalBudget > 0 ? styles.statOver : ""].join(" ")}>
            {fmtILS(totalActual)}
          </span>
          <span className={styles.statLabel}>בפועל</span>
        </div>
        <div className={styles.stat}>
          <span className={[styles.statNum,
            diff > 0 ? styles.statOver : diff < 0 ? styles.statUnder : ""].join(" ")}>
            {diff === 0 || (totalBudget === 0 && totalActual === 0) ? "—" :
              (diff > 0 ? "+" : "") + "₪" + Math.abs(diff).toLocaleString("he-IL", { maximumFractionDigits: 0 })}
          </span>
          <span className={styles.statLabel}>{diff > 0 ? "חריגה" : diff < 0 ? "חיסכון" : "הפרש"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{costPerGuest > 0 ? "₪" + costPerGuest.toLocaleString() : "—"}</span>
          <span className={styles.statLabel}>עלות לאורח</span>
        </div>
      </div>

      {/* ── Categories table ── */}
      <div className={[base.card].join(" ")}>
        <SectionLabel>פירוט קטגוריות</SectionLabel>

        <div className={styles.table}>
          {/* Header */}
          <div className={styles.tableHead}>
            <span className={styles.colCat}>קטגוריה</span>
            <span className={styles.colAmt}>תקציב (₪)</span>
            <span className={styles.colAmt}>בפועל (₪)</span>
            <span className={styles.colDiff}>הפרש</span>
            <span className={styles.colDel} />
          </div>

          {cats.map(c => {
            const b   = parseFloat(c.budget) || 0;
            const a   = parseFloat(c.actual) || 0;
            const d   = a - b;
            const pct = b > 0 ? Math.round((a / b) * 100) : null;
            return (
              <div key={c.id} className={styles.tableRow}>
                <div className={styles.colCat}>
                  <span className={styles.catEmoji}>{c.emoji}</span>
                  <input
                    className={styles.nameInput}
                    value={c.name}
                    onChange={e => setField(c.id, "name", e.target.value)}
                    placeholder="שם קטגוריה"
                  />
                </div>
                <div className={styles.colAmt}>
                  <input
                    className={styles.amtInput}
                    type="number"
                    min="0"
                    value={c.budget}
                    placeholder="0"
                    onChange={e => setField(c.id, "budget", e.target.value)}
                  />
                </div>
                <div className={styles.colAmt}>
                  <input
                    className={styles.amtInput}
                    type="number"
                    min="0"
                    value={c.actual}
                    placeholder="0"
                    onChange={e => setField(c.id, "actual", e.target.value)}
                  />
                </div>
                <div className={styles.colDiff}>
                  {b > 0 || a > 0 ? (
                    <span className={[styles.diffBadge, d > 0 ? styles.over : d < 0 ? styles.under : styles.exact].join(" ")}>
                      {d === 0 ? "✓"
                        : (d > 0 ? "+" : "") + "₪" + Math.abs(d).toLocaleString()}
                      {pct !== null && d !== 0 && <span className={styles.pct}> {pct}%</span>}
                    </span>
                  ) : <span className={styles.diffEmpty}>—</span>}
                </div>
                <div className={styles.colDel}>
                  <button
                    className={styles.delBtn}
                    onClick={() => removeRow(c.id)}
                    type="button"
                    title="הסר שורה"
                    aria-label="הסר"
                  >✕</button>
                </div>
              </div>
            );
          })}

          {/* Add row */}
          {adding ? (
            <div className={styles.addRow}>
              <input
                className={styles.nameInput}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="שם קטגוריה חדשה"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter") addRow();
                  if (e.key === "Escape") { setAdding(false); setNewName(""); }
                }}
              />
              <button className={base.btnSm} onClick={addRow} type="button">הוסף</button>
              <button className={[base.btnSm, styles.cancelBtn].join(" ")} onClick={() => { setAdding(false); setNewName(""); }} type="button">ביטול</button>
            </div>
          ) : (
            <button className={styles.addBtn} onClick={() => setAdding(true)} type="button">
              + הוסף קטגוריה
            </button>
          )}
        </div>

        <div className={base.formActions}>
          <button className={base.btnPrimary} onClick={save} disabled={!dirty}>
            שמור תקציב
          </button>
          {!dirty && (
            <span style={{ fontSize: 12, color: "var(--muted)" }}>כל השינויים שמורים</span>
          )}
        </div>
      </div>
    </div>
  );
}
