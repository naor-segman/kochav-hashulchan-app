import { useState, useMemo, useEffect, useRef } from "react";
import Icon from "../components/ui/Icon.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./CostScreen.module.css";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";

const DEFAULT_CATEGORIES = [
  { id: "venue",        name: "אולם",           budget: 0, actual: 0 },
  { id: "catering",     name: "קייטרינג",        budget: 0, actual: 0 },
  { id: "music",        name: "מוזיקה",          budget: 0, actual: 0 },
  { id: "photographer", name: "צלם וצלמת",       budget: 0, actual: 0 },
  { id: "flowers",      name: "פרחים ועיצוב",    budget: 0, actual: 0 },
  { id: "invitations",  name: "הזמנות",          budget: 0, actual: 0 },
  { id: "other",        name: "אחר",             budget: 0, actual: 0 },
];

function initCategories(ev) {
  const existing = ev?.costs?.categories;
  if (Array.isArray(existing) && existing.length > 0) return existing;
  return DEFAULT_CATEGORIES.map(c => ({ ...c, budget: "", actual: "" }));
}

function parseAmt(v) {
  return parseFloat(v) || 0;
}

function fmtILS(n) {
  return n > 0 ? "₪" + n.toLocaleString("he-IL", { maximumFractionDigits: 0 }) : "—";
}

// Net can be negative (a deficit) — show a signed amount, not "—".
function fmtNet(n) {
  if (!n) return "₪0";
  const abs = Math.abs(n).toLocaleString("he-IL", { maximumFractionDigits: 0 });
  return (n < 0 ? "−₪" : "+₪") + abs;
}

export default function CostScreen({ activeEvent: ev, patchEvent }) {
  const [cats, setCats]    = useState(() => initCategories(ev));
  const [bulkGift, setBulkGift] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // Auto-save like every other screen — no manual "save budget" button, no
  // silent data loss on navigation.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    patchEvent({ costs: { categories: cats } });
  }, [cats, patchEvent]);

  const setField = (id, field, value) => {
    setCats(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeRow = (id) => {
    setCats(prev => prev.filter(c => c.id !== id));
  };

  const addRow = () => {
    const name = newName.trim();
    if (!name) return;
    setCats(prev => [...prev, { id: crypto.randomUUID(), name, budget: "", actual: "" }]);
    setNewName("");
    setAdding(false);
  };

  const totalBudget = useMemo(() =>
    cats.reduce((s, c) => s + parseAmt(c.budget), 0), [cats]);

  const totalActual = useMemo(() =>
    cats.reduce((s, c) => s + parseAmt(c.actual), 0), [cats]);

  const totalDiff = totalActual - totalBudget;

  const totalGuests = useMemo(() =>
    (ev?.guests ?? []).reduce((s, g) => s + (g.count || 1), 0), [ev]);

  // ── Income forecast: sum of the PER-GUEST estimated gifts the host entered,
  // vs actual gifts, and the net picture. Only attending (not declined) count.
  const estIncome = useMemo(() =>
    (ev?.guests ?? []).filter(g => g.rsvp !== "declined").reduce((s, g) => s + (g.estGift || 0), 0), [ev]);
  const nEstimated = useMemo(() =>
    (ev?.guests ?? []).filter(g => g.rsvp !== "declined" && g.estGift > 0).length, [ev]);
  const nAttending = useMemo(() =>
    (ev?.guests ?? []).filter(g => g.rsvp !== "declined").length, [ev]);
  const actualIncome = useMemo(() =>
    (ev?.guests ?? []).reduce((s, g) => s + (g.giftAmount || 0), 0), [ev]);
  const netExpected  = estIncome - totalBudget;
  const netActual    = actualIncome - totalActual;

  // Convenience: set a per-person estimate on every attending guest at once
  // (host can then fine-tune individuals in the guest list).
  const applyBulkEstimate = () => {
    const per = parseAmt(bulkGift);
    if (per <= 0) return;
    patchEvent(e => ({
      ...e,
      guests: (e.guests || []).map(g => g.rsvp === "declined" ? g : { ...g, estGift: per * (g.count || 1) }),
    }));
    setBulkGift("");
  };

  const costPerGuest = totalGuests > 0 && totalActual > 0
    ? Math.round(totalActual / totalGuests)
    : 0;

  const cateringActual = useMemo(() => {
    // Match by name (case-insensitive) so the hint survives delete+re-add of the row.
    const cat = cats.find(c => c.name?.trim() === "קייטרינג" || c.id === "catering");
    return cat ? parseAmt(cat.actual) : 0;
  }, [cats]);

  const cateringPerGuest = totalGuests > 0 && cateringActual > 0
    ? Math.round(cateringActual / totalGuests)
    : 0;

  return (
    <div className={base.page}>
      <PageHeader
        title="תכנון תקציב"
        icon={<Icon name="chart" />}
        sub="נהלו את תקציב האירוע — מתוכנן מול בפועל — לאורך כל הדרך. כל שינוי נשמר אוטומטית."
      />

      {/* ── Stats ── */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{fmtILS(totalBudget)}</span>
          <span className={styles.statLabel}>תקציב מתוכנן</span>
        </div>
        <div className={styles.stat}>
          <span className={[
            styles.statNum,
            totalActual > totalBudget && totalBudget > 0 ? styles.statOver : "",
          ].join(" ")}>
            {fmtILS(totalActual)}
          </span>
          <span className={styles.statLabel}>בפועל</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>
            {totalGuests > 0 ? totalGuests.toLocaleString("he-IL") : "—"}
          </span>
          <span className={styles.statLabel}>מספר אורחים</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>
            {costPerGuest > 0
              ? "₪" + costPerGuest.toLocaleString("he-IL") + "‏/אורח"
              : "—"}
          </span>
          <span className={styles.statLabel}>עלות לאורח</span>
        </div>
      </div>

      {/* ── Catering hint ── */}
      {totalGuests > 0 && cateringPerGuest > 0 && (
        <div className={styles.cateringHint}>
          <span className={styles.cateringHintIcon} aria-hidden="true">🍽</span>
          <span>
            קייטרינג = {totalGuests.toLocaleString("he-IL")} אורחים × ₪{cateringPerGuest.toLocaleString("he-IL")}/אורח
          </span>
        </div>
      )}

      {/* ── Categories table ── */}
      <div className={base.card}>
        <SectionLabel>פירוט קטגוריות</SectionLabel>

        <div className={styles.tableWrap}>
          <div className={styles.table}>
            {/* Header */}
            <div className={[styles.tableRow, styles.tableHead].join(" ")}>
              <span className={styles.colCat}>קטגוריה</span>
              <span className={styles.colAmt}>תקציב (₪)</span>
              <span className={styles.colAmt}>בפועל (₪)</span>
              <span className={styles.colDiff}>הפרש</span>
              <span className={styles.colDel} />
            </div>

            {/* Data rows */}
            {cats.map(c => {
              const b = parseAmt(c.budget);
              const a = parseAmt(c.actual);
              const d = a - b;
              return (
                <div key={c.id} className={styles.tableRow}>
                  <div className={styles.colCat}>
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
                      <span className={[
                        styles.diffBadge,
                        d > 0 ? styles.over : d < 0 ? styles.under : styles.exact,
                      ].join(" ")}>
                        {d === 0
                          ? "✓"
                          : (d > 0 ? "+" : "−") + "₪" + Math.abs(d).toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                      </span>
                    ) : (
                      <span className={styles.diffEmpty}>—</span>
                    )}
                  </div>
                  <div className={styles.colDel}>
                    <button
                      className={styles.delBtn}
                      onClick={() => removeRow(c.id)}
                      type="button"
                      title="הסירו שורה"
                      aria-label="הסירו"
                    >✕</button>
                  </div>
                </div>
              );
            })}

            {/* Totals row */}
            <div className={[styles.tableRow, styles.totalsRow].join(" ")}>
              <div className={styles.colCat}>
                <span className={styles.totalsLabel}>סה״כ</span>
              </div>
              <div className={styles.colAmt}>
                <span className={styles.totalsNum}>
                  {totalBudget > 0
                    ? "₪" + totalBudget.toLocaleString("he-IL", { maximumFractionDigits: 0 })
                    : "—"}
                </span>
              </div>
              <div className={styles.colAmt}>
                <span className={[
                  styles.totalsNum,
                  totalActual > totalBudget && totalBudget > 0 ? styles.totalsOver : "",
                ].join(" ")}>
                  {totalActual > 0
                    ? "₪" + totalActual.toLocaleString("he-IL", { maximumFractionDigits: 0 })
                    : "—"}
                </span>
              </div>
              <div className={styles.colDiff}>
                {totalBudget > 0 || totalActual > 0 ? (
                  <span className={[
                    styles.diffBadge,
                    totalDiff > 0 ? styles.over : totalDiff < 0 ? styles.under : styles.exact,
                  ].join(" ")}>
                    {totalDiff === 0
                      ? "✓"
                      : (totalDiff > 0 ? "+" : "−") + "₪" + Math.abs(totalDiff).toLocaleString("he-IL", { maximumFractionDigits: 0 })}
                  </span>
                ) : (
                  <span className={styles.diffEmpty}>—</span>
                )}
              </div>
              <div className={styles.colDel} />
            </div>

            {/* Add custom category */}
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
                <button className={base.btnSm} onClick={addRow} type="button">הוסיפו</button>
                <button
                  className={[base.btnSm, styles.cancelBtn].join(" ")}
                  onClick={() => { setAdding(false); setNewName(""); }}
                  type="button"
                >ביטול</button>
              </div>
            ) : (
              <button className={styles.addBtn} onClick={() => setAdding(true)} type="button">
                + הוסיפו קטגוריה
              </button>
            )}
          </div>
        </div>

        <div className={base.formActions}>
          <span className={styles.savedHint}>✓ נשמר אוטומטית</span>
        </div>
      </div>

      {/* ── Income forecast + net picture ── */}
      <div className={base.card}>
        <SectionLabel>הכנסה צפויה ותמונת נטו</SectionLabel>
        <p className={base.fieldHint}>
          "הכנסה צפויה" מסכמת את המתנה המשוערת שהזנתם לכל אורח (במסך האורחים).
          "הכנסה בפועל" מתמלאת מהמתנות שנרשמות בצ׳ק-אין.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", margin: "8px 0 16px" }}>
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
              מילוי מהיר — מתנה משוערת לאדם (₪)
            </label>
            <input className={base.input} type="number" min="0" step="50" value={bulkGift}
              placeholder="למשל 400" onChange={e => setBulkGift(e.target.value)} />
          </div>
          <button className={base.btnSecondary} onClick={applyBulkEstimate} disabled={parseAmt(bulkGift) <= 0}>
            החל לכל האורחים
          </button>
        </div>
        {nAttending > 0 && (
          <p className={base.fieldHint} style={{ marginTop: -8, marginBottom: 12 }}>
            הזנתם הערכה ל-{nEstimated} מתוך {nAttending} אורחים. אפשר לכוונן כל אורח בנפרד במסך האורחים.
          </p>
        )}
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statNum}>{estIncome > 0 ? fmtILS(estIncome) : "—"}</span>
            <span className={styles.statLabel}>הכנסה צפויה</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statNum}>{actualIncome > 0 ? fmtILS(actualIncome) : "—"}</span>
            <span className={styles.statLabel}>הכנסה בפועל (מתנות)</span>
          </div>
          <div className={styles.stat}>
            <span className={[styles.statNum, netExpected < 0 ? styles.statOver : ""].join(" ")}>
              {(estIncome > 0 || totalBudget > 0) ? fmtNet(netExpected) : "—"}
            </span>
            <span className={styles.statLabel}>צפי נטו (צפוי − מתוכנן)</span>
          </div>
          <div className={styles.stat}>
            <span className={[styles.statNum, netActual < 0 ? styles.statOver : ""].join(" ")}>
              {(actualIncome > 0 || totalActual > 0) ? fmtNet(netActual) : "—"}
            </span>
            <span className={styles.statLabel}>נטו בפועל</span>
          </div>
        </div>
      </div>
    </div>
  );
}
