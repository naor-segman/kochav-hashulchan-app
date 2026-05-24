import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { GROUP_OPTIONS } from "../data/constants.js";
import { downloadGuestTemplate } from "../data/guestTemplate.js";
import { uid } from "../utils/uid.js";
import Banner from "../components/feedback/Banner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import SideDot from "../components/ui/SideDot.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./GuestManagerScreen.module.css";

function ExcelImportFlow({ ev, patchEvent, showToast, onClose }) {
  const [step, setStep]             = useState("upload");
  const [classified, setClassified] = useState(null);
  const [parseErr, setParseErr]     = useState("");
  const [skipDups, setSkipDups]     = useState(true);
  const dropRef = useRef(null);
  const fileRef = useRef(null);

  const brideSide = ev.brideName ? "צד " + ev.brideName : "צד כלה";
  const groomSide = ev.groomName ? "צד " + ev.groomName : "צד חתן";
  const sideLabel = s => s === "bride" ? brideSide : groomSide;

  const classifyRows = (rawRows) => {
    const existingNames  = new Set(ev.guests.map(g => g.name.trim().toLowerCase()));
    const existingPhones = new Set(
      ev.guests.map(g => (g.phone || "").trim()).filter(Boolean)
    );
    const newGuests  = [];
    const duplicates = [];
    const invalid    = [];

    rawRows.forEach(r => {
      const name = String(r["שם מלא"] || r["שם"] || "").trim();
      if (!name || name.startsWith("דוגמה") || name.startsWith("(")) return;

      const rawCount    = r["כמות"] ?? r["מספר מוזמנים"];
      const rawCountStr = String(rawCount ?? "").trim();
      let count = 1;
      if (rawCountStr !== "") {
        const parsed = parseInt(rawCountStr);
        if (isNaN(parsed) || parsed < 1) {
          invalid.push({ name, issue: 'כמות לא תקינה: "' + rawCountStr + '"' });
          return;
        }
        count = parsed;
      }

      const phone    = String(r["טלפון"] || "").trim();
      const notes    = String(r["הערות"] || "").trim();
      const rawGroup = String(r["קבוצה"] || "").trim();
      const group    = GROUP_OPTIONS.includes(rawGroup) ? rawGroup : "אחר";
      let side = "bride";
      const rawSide = String(r["צד"] || "").trim();
      if (rawSide.includes("חתן") || rawSide === groomSide) side = "groom";
      else if (rawSide.includes("כלה") || rawSide === brideSide) side = "bride";

      const guest = { id: uid(), name, count, phone, notes, group, side };

      const nameMatch  = existingNames.has(name.toLowerCase());
      const phoneMatch = phone && existingPhones.has(phone);

      if (nameMatch || phoneMatch) {
        duplicates.push({ guest, reason: nameMatch ? "שם זהה לאורח קיים" : "טלפון זהה לאורח קיים" });
      } else {
        newGuests.push(guest);
      }
    });

    return { newGuests, duplicates, invalid };
  };

  const parseFile = (file) => {
    if (!file) return;
    setParseErr("");
    const ext    = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let rows;
        if (ext === "csv") {
          const text  = e.target.result;
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (!lines.length) { setParseErr("הקובץ ריק"); return; }
          const sep  = lines[0].includes("\t") ? "\t" : ",";
          const hdrs = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
          rows = lines.slice(1).map(line => {
            const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
            const obj  = {};
            hdrs.forEach((h, i) => { obj[h] = vals[i] || ""; });
            return obj;
          });
        } else {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows     = XLSX.utils.sheet_to_json(ws, { defval: "" });
        }
        if (!rows.length) { setParseErr("לא נמצאו שורות בקובץ"); return; }
        if (!rows[0] || (!("שם מלא" in rows[0]) && !("שם" in rows[0]))) {
          setParseErr("הקובץ לא נראה כתבנית שלנו. ודא שהורדת את התבנית ומילאת אותה.");
          return;
        }
        const result = classifyRows(rows);
        if (result.newGuests.length === 0 && result.duplicates.length === 0) {
          setParseErr(
            result.invalid.length > 0
              ? "כל הרשומות לא תקניות (" + result.invalid.length + " שגיאות). בדוק את הקובץ."
              : "לא נמצאו רשומות לייבוא (שורות הדגמה הוסרו אוטומטית)"
          );
          return;
        }
        setClassified(result);
        setStep("confirm");
      } catch (err) {
        setParseErr("שגיאה בקריאת הקובץ: " + (err.message || "פורמט לא תקין"));
      }
    };
    if (ext === "csv") reader.readAsText(file, "UTF-8");
    else reader.readAsArrayBuffer(file);
  };

  const doImport = () => {
    const { newGuests, duplicates } = classified;
    const toImport = skipDups
      ? newGuests
      : [...newGuests, ...duplicates.map(d => d.guest)];
    if (toImport.length === 0) { showToast("אין רשומות לייבוא", "err"); return; }
    patchEvent(e => Object.assign({}, e, { guests: e.guests.concat(toImport) }));
    const seats  = toImport.reduce((s, g) => s + (g.count || 1), 0);
    const dupMsg = skipDups && duplicates.length > 0
      ? " · " + duplicates.length + " כפולים דולגו" : "";
    showToast("יובאו " + toImport.length + " רשומות — " + seats + " מקומות ✓" + dupMsg);
    onClose();
  };

  const onDrop = e => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.style.borderColor = "";
    parseFile(e.dataTransfer.files[0]);
  };
  const onDragOver = e => {
    e.preventDefault();
    if (dropRef.current) dropRef.current.style.borderColor = "var(--accent)";
  };
  const onDragLeave = () => {
    if (dropRef.current) dropRef.current.style.borderColor = "";
  };

  const cl = classified || { newGuests: [], duplicates: [], invalid: [] };
  const toImportList = classified
    ? (skipDups ? cl.newGuests : [...cl.newGuests, ...cl.duplicates.map(d => d.guest)])
    : [];
  const toImportCount = toImportList.length;
  const toImportSeats = toImportList.reduce((s, g) => s + (g.count || 1), 0);

  const GuestMiniTable = ({ rows }) => (
    <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <table className={base.importPreviewTable}>
        <thead>
          <tr>
            <th className={base.importTh}>שם</th>
            <th className={base.importTh} style={{ textAlign: "center" }}>מקומות</th>
            <th className={base.importTh}>צד</th>
            <th className={base.importTh}>קבוצה</th>
            <th className={base.importTh}>טלפון</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((g, i) => (
            <tr key={i} style={i % 2 === 1 ? { background: "var(--bg)" } : {}}>
              <td className={base.importTd}>{g.name}</td>
              <td className={base.importTd} style={{ textAlign: "center" }}>
                {(g.count || 1) > 1
                  ? <strong style={{ color: "var(--accent)" }}>{g.count}</strong>
                  : <span style={{ color: "var(--muted)" }}>1</span>}
              </td>
              <td className={base.importTd} style={{ fontSize: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <SideDot side={g.side} />{sideLabel(g.side)}
                </span>
              </td>
              <td className={base.importTd} style={{ fontSize: 12 }}>{g.group}</td>
              <td className={base.importTd} style={{ color: "var(--muted)", fontSize: 12 }}>{g.phone || "—"}</td>
            </tr>
          ))}
          {rows.length > 100 && (
            <tr>
              <td colSpan={5} className={base.importTd} style={{ textAlign: "center", color: "var(--muted)", fontStyle: "italic" }}>
                ...ועוד {rows.length - 100}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={base.importWrap}>
      <div className={base.stepPills}>
        {[["upload", "1. הורד והכן"], ["confirm", "2. אשר ויבא"]].map(([s, l], i) => (
          <span key={s} style={{ display: "contents" }}>
            {i > 0 && <span className={base.stepPillSep}>›</span>}
            <span className={[base.stepPill, step === s ? base.stepPillActive : ""].filter(Boolean).join(" ")}>{l}</span>
          </span>
        ))}
        <button
          className={[base.btnSm, base.btnGhost].join(" ")}
          style={{ marginInlineStart: "auto" }}
          onClick={onClose}
        >✕ סגור</button>
      </div>

      {step === "upload" && (
        <div className={base.importStep}>
          <div className={base.templateCard}>
            <div className={base.templateCardIcon}>📋</div>
            <div style={{ flex: 1 }}>
              <div className={base.templateCardTitle}>התחל עם תבנית מוכנה</div>
              <div className={base.templateCardSub}>
                קובץ Excel עם כל העמודות, רשימות נפתחות לצד ולקבוצה, והסברים בתוך הקובץ.
                מלא אותו ואז העלה בחזרה.
              </div>
            </div>
            <button
              className={base.downloadLink}
              style={{ border: "none", cursor: "pointer" }}
              onClick={() => downloadGuestTemplate(
                "רשימת_אורחים_" + (ev.name || "אורחים").replace(/[^א-תa-zA-Z0-9]/g, "_") + ".xlsx"
              )}
            >
              ⬇ הורד תבנית Excel
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>אחרי שמילאת — העלה כאן</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <div
            ref={dropRef}
            className={base.importDropzone}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileRef.current && fileRef.current.click()}
          >
            <div className={base.importDropzoneIcon}>📤</div>
            <div className={base.importDropzoneText}>גרור לכאן את הקובץ המלא</div>
            <div className={base.importDropzoneHint}>או לחץ לבחירת קובץ · xlsx, xls, csv</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={e => { if (e.target.files[0]) parseFile(e.target.files[0]); }}
          />

          {parseErr && <Banner variant="warn">⚠ {parseErr}</Banner>}

          <div className={base.fieldHint}>הקובץ נקרא בדפדפן בלבד — לא נשלח לאף שרת.</div>
        </div>
      )}

      {step === "confirm" && classified && (
        <div className={base.importStep}>

          {/* ── Summary row ── */}
          <div className={styles.importSummaryRow}>
            <span className={styles.importSumNew}>✓ {cl.newGuests.length} חדשים</span>
            {cl.duplicates.length > 0 && (
              <span className={styles.importSumDup}>⚠ {cl.duplicates.length} כפולים</span>
            )}
            {cl.invalid.length > 0 && (
              <span className={styles.importSumBad}>✕ {cl.invalid.length} לא תקינים</span>
            )}
          </div>

          {/* ── New guests ── */}
          {cl.newGuests.length > 0 && (
            <div>
              <div className={styles.importSectionHead} style={{ color: "var(--green)" }}>
                ✓ אורחים חדשים — {cl.newGuests.length}
              </div>
              <GuestMiniTable rows={cl.newGuests} />
            </div>
          )}

          {/* ── Duplicates ── */}
          {cl.duplicates.length > 0 && (
            <div className={styles.importDupSection}>
              <div className={styles.importDupHead}>
                <span className={styles.importSectionHead} style={{ color: "var(--warn)" }}>
                  ⚠ כפולים אפשריים — {cl.duplicates.length}
                </span>
                <label className={styles.importDupToggle}>
                  <input
                    type="checkbox"
                    checked={skipDups}
                    onChange={e => setSkipDups(e.target.checked)}
                  />
                  דלג על כפולים
                </label>
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--warn-border)", borderRadius: "var(--radius)" }}>
                <table className={base.importPreviewTable}>
                  <thead>
                    <tr>
                      <th className={base.importTh}>שם</th>
                      <th className={base.importTh} style={{ textAlign: "center" }}>מקומות</th>
                      <th className={base.importTh}>צד</th>
                      <th className={base.importTh}>קבוצה</th>
                      <th className={base.importTh}>סיבה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cl.duplicates.slice(0, 50).map((d, i) => (
                      <tr key={i} className={styles.importRowDup}>
                        <td className={base.importTd}>{d.guest.name}</td>
                        <td className={base.importTd} style={{ textAlign: "center" }}>
                          {(d.guest.count || 1) > 1
                            ? <strong style={{ color: "var(--accent)" }}>{d.guest.count}</strong>
                            : <span style={{ color: "var(--muted)" }}>1</span>}
                        </td>
                        <td className={base.importTd} style={{ fontSize: 12 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <SideDot side={d.guest.side} />{sideLabel(d.guest.side)}
                          </span>
                        </td>
                        <td className={base.importTd} style={{ fontSize: 12 }}>{d.guest.group}</td>
                        <td className={base.importTd} style={{ fontSize: 11, color: "var(--warn)" }}>{d.reason}</td>
                      </tr>
                    ))}
                    {cl.duplicates.length > 50 && (
                      <tr>
                        <td colSpan={5} className={base.importTd} style={{ textAlign: "center", color: "var(--muted)", fontStyle: "italic" }}>
                          ...ועוד {cl.duplicates.length - 50}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Invalid rows ── */}
          {cl.invalid.length > 0 && (
            <div>
              <div className={styles.importSectionHead} style={{ color: "var(--red)" }}>
                ✕ שורות לא תקניות — {cl.invalid.length} (לא יובאו)
              </div>
              <div style={{ maxHeight: 140, overflowY: "auto", border: "1px solid var(--red-border)", borderRadius: "var(--radius)" }}>
                <table className={base.importPreviewTable}>
                  <thead>
                    <tr>
                      <th className={base.importTh}>שם</th>
                      <th className={base.importTh}>בעיה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cl.invalid.slice(0, 30).map((item, i) => (
                      <tr key={i} className={styles.importRowBad}>
                        <td className={base.importTd}>{item.name || "(ללא שם)"}</td>
                        <td className={base.importTd} style={{ fontSize: 12, color: "var(--red)" }}>{item.issue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className={base.btnPrimary}
              onClick={doImport}
              disabled={toImportCount === 0}
            >
              ✓ ייבא {toImportCount} רשומות ({toImportSeats} מקומות)
            </button>
            <button
              className={base.btnSecondary}
              onClick={() => { setStep("upload"); setClassified(null); setParseErr(""); }}
            >
              חזור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GuestManagerScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const EF = { name: "", side: "bride", group: "משפחה קרובה", count: 1, phone: "", notes: "" };
  const [form, setForm]         = useState(EF);
  const [editId, setEditId]     = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [filter, setFilter]     = useState({ side: "all", group: "all", search: "" });
  const nameRef                 = useRef(null);
  const setF = (k, v) => setForm(p => Object.assign({}, p, { [k]: v }));

  useEffect(() => { if (!editId) nameRef.current && nameRef.current.focus(); }, []);

  const sideLabel = s =>
    s === "bride"
      ? (ev.brideName ? "צד " + ev.brideName : "צד כלה")
      : (ev.groomName ? "צד " + ev.groomName : "צד חתן");

  const saveGuest = () => {
    if (!form.name.trim()) { showToast("יש להזין שם אורח", "err"); return; }
    if (editId) {
      patchEvent(e => Object.assign({}, e, {
        guests: e.guests.map(g =>
          g.id === editId ? Object.assign({}, g, form, { name: form.name.trim() }) : g
        )
      }));
      setEditId(null);
      showToast("פרטי האורח עודכנו ✓");
    } else {
      const newG = Object.assign({}, form, { id: uid(), name: form.name.trim(), count: form.count || 1 });
      patchEvent(e => Object.assign({}, e, { guests: e.guests.concat([newG]) }));
      showToast(form.name.trim() + " נוסף/ה לרשימה ✓");
    }
    setForm(p => Object.assign({}, EF, { side: p.side, group: p.group }));
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(EF);
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const delGuest = (id, name) => {
    if (!confirm("למחוק את \"" + name + "\" מרשימת האורחים?")) return;
    patchEvent(e => Object.assign({}, e, {
      guests:  e.guests.filter(g => g.id !== id),
      seating: Object.fromEntries(Object.entries(e.seating).filter(([gid]) => gid !== id)),
    }));
    showToast(name + " הוסר/ה");
  };

  const visible = ev.guests.filter(g => {
    if (filter.side !== "all" && g.side !== filter.side) return false;
    if (filter.group !== "all" && g.group !== filter.group) return false;
    if (filter.search && !g.name.includes(filter.search)) return false;
    return true;
  });

  const groups    = Array.from(new Set(ev.guests.map(g => g.group))).sort();
  const nBride    = ev.guests.filter(g => g.side === "bride").length;
  const nGroom    = ev.guests.filter(g => g.side === "groom").length;
  const nSeated   = ev.guests.filter(g => ev.seating[g.id]).length;
  const nUnseated = ev.guests.length - nSeated;
  const tableOf   = id => { const tid = ev.seating[id]; return tid ? ev.tables.find(t => t.id === tid) : null; };
  const isFiltered = filter.side !== "all" || filter.group !== "all" || filter.search;

  return (
    <div className={base.page}>
      <PageHeader
        title="אורחים"
        icon="👥"
        sub="נהל את רשימת האורחים. לחץ Enter להוספה מהירה."
        aside={
          <div className={base.pills}>
            <StatPill n={ev.guests.length} label="סה״כ" />
            <StatPill n={nBride} label={sideLabel("bride")} color="var(--bride)" />
            <StatPill n={nGroom} label={sideLabel("groom")} color="var(--groom)" />
            {nSeated > 0 && <StatPill n={nSeated} label="משובצים" color="var(--green)" />}
            {nUnseated > 0 && nSeated > 0 && <StatPill n={nUnseated} label="ממתינים" color="var(--warn)" />}
          </div>
        }
      />

      <div className={styles.stepGuide}>
        <span className={styles.stepBadge}>שלב 3 מתוך 5 — אורחים</span>
        <span className={styles.stepText}>הוסיפו אורחים ידנית אחד-אחד, או ייבאו רשימה שלמה מ-Excel. לאחר מכן המשיכו לאילוצים.</span>
      </div>

      <div className={[base.card, editId ? base.cardEdit : ""].filter(Boolean).join(" ")}>
        <SectionLabel>
          {editId
            ? ("✏ עריכת אורח — " + (ev.guests.find(g => g.id === editId) || {}).name)
            : "הוספת אורח ידנית"}
        </SectionLabel>
        {!editId && (
          <p className={styles.addHint}>
            הוספה אחת בכל פעם. להוספה מהירה של עשרות אורחים בבת אחת — לחצו על "ייבוא מ-Excel" למטה.
          </p>
        )}

        <div className={base.grid2}>
          <Field label="שם מלא" required>
            <input
              ref={nameRef}
              className={base.input}
              value={form.name}
              placeholder="שם ושם משפחה"
              onChange={e => setF("name", e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveGuest(); }}
            />
          </Field>
          <Field label="טלפון" hint="אופציונלי">
            <input className={base.input} value={form.phone} placeholder="050-0000000"
              onChange={e => setF("phone", e.target.value)} />
          </Field>
          <Field label="מס׳ מוזמנים" hint="כמה מקומות תופסת הרשומה הזו">
            <input className={base.input} type="number" min="1" max="50" value={form.count || 1}
              onChange={e => setF("count", Math.max(1, parseInt(e.target.value) || 1))} />
          </Field>
        </div>

        <div className={base.grid2}>
          <Field label="צד" hint="מי מזמין את האורח">
            <div className={base.seg}>
              {["bride", "groom"].map(s => (
                <button
                  key={s}
                  className={[
                    base.segBtn,
                    form.side === s ? (s === "bride" ? base.segBride : base.segGroom) : ""
                  ].filter(Boolean).join(" ")}
                  onClick={() => setF("side", s)}
                >
                  {sideLabel(s)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="קבוצה" hint="ישפיע על הסידור האוטומטי">
            <select className={base.select} value={form.group} onChange={e => setF("group", e.target.value)}>
              {GROUP_OPTIONS.map(g => <option key={g}>{g}</option>)}
            </select>
          </Field>
        </div>

        <Field label="הערות">
          <input
            className={base.input}
            value={form.notes}
            placeholder="הגבלות תזונה, מוגבלות, הערה כלשהי..."
            onChange={e => setF("notes", e.target.value)}
          />
        </Field>

        <div className={base.formActions}>
          <button className={base.btnPrimary} onClick={saveGuest}>
            {editId ? "שמור שינויים" : "+ הוסף אורח"}
          </button>
          {editId && <button className={base.btnSecondary} onClick={cancelEdit}>ביטול</button>}
          {!editId && (
            <button className={base.btnSecondary} onClick={() => setShowBulk(p => !p)}>
              {showBulk ? "סגור ייבוא" : "📥 ייבוא מ-Excel"}
            </button>
          )}
          {!editId && <span className={base.fieldHint}>Enter = הוסף מהיר</span>}
        </div>

        {showBulk && (
          <ExcelImportFlow
            ev={ev}
            patchEvent={patchEvent}
            showToast={showToast}
            onClose={() => setShowBulk(false)}
          />
        )}
      </div>

      {ev.guests.length > 0 && (
        <div className={base.filterBar}>
          <span className={styles.filterLabel}>סינון:</span>
          <input
            className={base.input}
            style={{ flex: 1, minWidth: 120 }}
            value={filter.search}
            placeholder="🔍 חיפוש לפי שם..."
            onChange={e => setFilter(p => Object.assign({}, p, { search: e.target.value }))}
          />
          <select className={base.select} style={{ minWidth: 130 }} value={filter.side}
            onChange={e => setFilter(p => Object.assign({}, p, { side: e.target.value }))}>
            <option value="all">כל הצדדים</option>
            <option value="bride">{sideLabel("bride")}</option>
            <option value="groom">{sideLabel("groom")}</option>
          </select>
          <select className={base.select} style={{ minWidth: 140 }} value={filter.group}
            onChange={e => setFilter(p => Object.assign({}, p, { group: e.target.value }))}>
            <option value="all">כל הקבוצות</option>
            {groups.map(g => <option key={g}>{g}</option>)}
          </select>
          {isFiltered ? (
            <>
              <span className={base.filterCount}>מציג {visible.length} מתוך {ev.guests.length}</span>
              <button className={[base.btnSm, base.btnGhost].join(" ")}
                onClick={() => setFilter({ side: "all", group: "all", search: "" })}>
                נקה ✕
              </button>
            </>
          ) : (
            <span className={base.filterCount}>{ev.guests.length} אורחים</span>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div className={base.gList}>
          {visible.map(g => {
            const t = tableOf(g.id);
            const isEditing = editId === g.id;
            return (
              <div key={g.id} className={[base.gRow, isEditing ? base.gRowActive : ""].filter(Boolean).join(" ")}>
                <SideDot side={g.side} />
                <div className={base.gInfo}>
                  <span className={base.gName}>
                    {g.name}
                    {(g.count || 1) > 1 && <span className={base.gCountBadge}>+{(g.count || 1) - 1}</span>}
                  </span>
                  <span className={base.gMeta}>
                    {sideLabel(g.side)} · {g.group}
                    {(g.count || 1) > 1 ? " · " + (g.count) + " מקומות" : ""}
                    {g.phone ? " · " + g.phone : ""}
                    {g.notes ? " · " + g.notes : ""}
                  </span>
                </div>
                {t
                  ? <span className={base.tagSeated}>⬡ {t.name}</span>
                  : <span className={base.tagUnseated}>לא שובץ</span>
                }
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className={[base.btnSm, base.btnGhost].join(" ")}
                    onClick={() => {
                      setForm({ name: g.name, side: g.side, group: g.group, count: g.count || 1, phone: g.phone || "", notes: g.notes || "" });
                      setEditId(g.id);
                      window.scrollTo(0, 0);
                    }}>
                    עריכה
                  </button>
                  <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delGuest(g.id, g.name)}>
                    מחק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ev.guests.length === 0 && (
        <EmptyState icon="👥" title="טרם נוספו אורחים"
          text='הוסיפו אורחים ידנית דרך הטופס למעלה, או לחצו על "ייבוא מ-Excel" לייבוא רשימה שלמה בבת אחת.' />
      )}
      {visible.length === 0 && ev.guests.length > 0 && (
        <EmptyState icon="🔍" title="אין תוצאות לסינון הנוכחי"
          text='לחצו על "נקה" כדי לאפס את הסינון ולראות את כל האורחים.' />
      )}

      <NextStep
        label="המשך להגדרת אילוצים"
        hint={ev.constraints.length > 0
          ? (ev.constraints.length + " אילוצים מוגדרים")
          : "אופציונלי — הגדר מי חייב / לא יכול לשבת יחד"}
        onClick={() => go("constraints")}
      />
    </div>
  );
}
