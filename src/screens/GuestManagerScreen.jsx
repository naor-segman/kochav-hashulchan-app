import { useState, useEffect, useRef } from "react";
import Icon from "../components/ui/Icon.jsx";
import { GROUP_OPTIONS, MEAL_OPTIONS, MEAL_DEFAULT } from "../data/constants.js";
import { downloadGuestTemplate } from "../data/guestTemplate.js";
import { getSideLabels, getSideLabel } from "../utils/eventHelpers.js";
import { buildColumnMap, readCell, parseSide } from "../utils/guestImport.js";
import { uid } from "../utils/uid.js";
import { usePlan } from "../hooks/usePlan.js";
import { canAddGuest } from "../utils/featureGates.js";
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

function ExcelImportFlow({ ev, patchEvent, showToast, onClose, maxGuests }) {
  const [step, setStep]             = useState("upload");
  const [classified, setClassified] = useState(null);
  const [parseErr, setParseErr]     = useState("");
  const [skipDups, setSkipDups]     = useState(true);
  const dropRef = useRef(null);
  const fileRef = useRef(null);

  const { bride: brideSide, groom: groomSide } = getSideLabels(ev);
  const sideLabel = s => getSideLabel(ev, s);

  const classifyRows = (rawRows) => {
    const existingNames  = new Set(ev.guests.map(g => g.name.trim().toLowerCase()));
    const existingPhones = new Set(
      ev.guests.map(g => (g.phone || "").trim()).filter(Boolean)
    );
    const newGuests       = [];
    const duplicates      = [];
    const invalid         = [];
    const newCustomGroups = [];

    // Map the file's actual headers to our logical fields so lists from other
    // services / hand-made sheets import without renaming columns.
    const col = buildColumnMap(rawRows[0] || {});

    rawRows.forEach(r => {
      const name = String(readCell(r, col, "name") || "").trim();
      if (!name || name.startsWith("דוגמה") || name.startsWith("(")) return;

      const rawCount    = readCell(r, col, "count");
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

      // Restore leading zero if Excel converted a phone number to a 9-digit integer
      const rawPhone = readCell(r, col, "phone");
      let phone = String(rawPhone ?? "").trim();
      if (phone && /^\d{9}$/.test(phone)) phone = "0" + phone;

      const notes    = String(readCell(r, col, "notes") || "").trim();
      const rawGroup = String(readCell(r, col, "group") || "").trim();
      const knownGroups = new Set([...GROUP_OPTIONS, ...(ev.customGroups || [])]);
      let group;
      if (!rawGroup) {
        group = "משפחה קרובה";
      } else if (knownGroups.has(rawGroup)) {
        group = rawGroup;
      } else {
        group = rawGroup;
        if (!newCustomGroups.includes(rawGroup)) newCustomGroups.push(rawGroup);
      }

      const side = parseSide(readCell(r, col, "side"), brideSide, groomSide);

      const rawRsvp = String(readCell(r, col, "rsvp") || "").trim().toLowerCase();
      const rsvp = rawRsvp.includes("אישר") || rawRsvp === "confirmed" ? "confirmed"
        : rawRsvp.includes("סירב") || rawRsvp === "declined" ? "declined"
        : rawRsvp.includes("אולי") || rawRsvp === "maybe" ? "maybe"
        : "pending";

      const rawMeal = String(readCell(r, col, "meal") || "").trim();
      const meal = rawMeal === "כשר מהדרין" ? "kosher"
        : rawMeal === "טבעוני" ? "vegan"
        : rawMeal === "צמחוני" ? "vegetarian"
        : rawMeal === "ילדים" ? "child"
        : rawMeal === "לא אוכל" ? "none"
        : MEAL_DEFAULT;

      const guest = { id: uid(), name, count, phone, notes, group, side, rsvp, meal };

      const nameMatch  = existingNames.has(name.toLowerCase());
      const phoneMatch = phone && existingPhones.has(phone);

      if (nameMatch || phoneMatch) {
        duplicates.push({ guest, reason: nameMatch ? "שם זהה לאורח קיים" : "טלפון זהה לאורח קיים" });
      } else {
        newGuests.push(guest);
      }
    });

    return { newGuests, duplicates, invalid, newCustomGroups };
  };

  const parseFile = (file) => {
    if (!file) return;
    setParseErr("");
    const ext    = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = async (e) => {
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
          const XLSX = await import("xlsx");
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows     = XLSX.utils.sheet_to_json(ws, { defval: "" });
        }
        if (!rows.length) { setParseErr("לא נמצאו שורות בקובץ"); return; }
        // Flexible header detection — accept any file that has a recognizable
        // name column, not only our exact template.
        const colMap = buildColumnMap(rows[0] || {});
        if (!colMap.name) {
          const found = Object.keys(rows[0] || {}).filter(Boolean).slice(0, 8).join(", ");
          setParseErr(
            "לא זוהתה עמודת שם בקובץ. ודאו שיש כותרת כמו \"שם\" או \"שם מלא\"." +
            (found ? " (כותרות שזוהו: " + found + ")" : "")
          );
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
    const { newGuests, duplicates, newCustomGroups } = classified;
    const toImport = skipDups
      ? newGuests
      : [...newGuests, ...duplicates.map(d => d.guest)];
    if (toImport.length === 0) { showToast("אין רשומות לייבוא", "err"); return; }
    if (maxGuests !== Infinity && ev.guests.length + toImport.length > maxGuests) {
      const remaining = Math.max(0, maxGuests - ev.guests.length);
      showToast(
        remaining === 0
          ? `הגעת למגבלת ${maxGuests} הרשומות בתוכנית הנוכחית — שדרג להוספת אורחים נוספים`
          : `ניתן להוסיף עוד ${remaining} רשומות בלבד בתוכנית הנוכחית (${ev.guests.length}/${maxGuests})`,
        "err"
      );
      return;
    }
    patchEvent(e => {
      const existingCustom = e.customGroups || [];
      const mergedCustom   = [...existingCustom, ...(newCustomGroups || []).filter(g => !existingCustom.includes(g))];
      return Object.assign({}, e, { guests: e.guests.concat(toImport), customGroups: mergedCustom });
    });
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
                "רשימת_אורחים_" + (ev.name || "אורחים").replace(/[^א-תa-zA-Z0-9]/g, "_") + ".xlsx",
                ev
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
                ✓ רשומות חדשות — {cl.newGuests.length}
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
  const EF = { name: "", side: "bride", group: "משפחה קרובה", count: 1, phone: "", notes: "", rsvp: "pending", meal: MEAL_DEFAULT, giftAmount: "" };
  const [form, setForm]           = useState(EF);
  const [editId, setEditId]       = useState(null);
  const [showBulk, setShowBulk]     = useState(false);
  const [showList, setShowList]     = useState(false);
  const [listText, setListText]     = useState("");
  const [listSide, setListSide]     = useState("bride");
  const [listGroup, setListGroup]   = useState("משפחה קרובה");
  const [filter, setFilter]       = useState({ side: "all", group: "all", rsvp: "all", search: "" });
  const [customGroupInput, setCustomGroupInput] = useState("");
  const nameRef                   = useRef(null);
  const setF = (k, v) => setForm(p => Object.assign({}, p, { [k]: v }));

  // All group options: standard + event-level custom + any already on guests (legacy compat).
  // "אחר" is always last and acts as the trigger to create a new custom group.
  const allGroupOptions = Array.from(new Set([
    ...GROUP_OPTIONS.filter(g => g !== "אחר"),
    ...(ev.customGroups || []),
    ...ev.guests.map(g => g.group).filter(g => g && g !== "אחר" && !GROUP_OPTIONS.includes(g)),
    "אחר",
  ]));
  const { plan, limits } = usePlan();
  const { maxGuests } = limits;

  useEffect(() => { if (!editId) nameRef.current && nameRef.current.focus(); }, []);

  const sideLabel = s => getSideLabel(ev, s);

  const resolveGroup = () => {
    if (form.group !== "אחר") return { group: form.group, newCustom: null };
    const name = customGroupInput.trim();
    if (!name) return { group: "אחר", newCustom: null };
    return { group: name, newCustom: name };
  };

  const saveGuest = () => {
    if (!form.name.trim()) { showToast("יש להזין שם אורח", "err"); return; }
    const { group, newCustom } = resolveGroup();
    if (form.group === "אחר" && !customGroupInput.trim()) {
      showToast("יש להזין שם לקבוצה החדשה", "err"); return;
    }
    if (editId) {
      if (!ev.guests.some(g => g.id === editId)) {
        cancelEdit();
        showToast("האורח כבר נמחק", "err");
        return;
      }
      const giftAmount = form.giftAmount !== "" && !isNaN(parseInt(form.giftAmount)) ? Math.max(0, parseInt(form.giftAmount)) : undefined;
      patchEvent(e => {
        const updated = e.guests.map(g =>
          g.id === editId ? Object.assign({}, g, form, { name: form.name.trim(), group, giftAmount }) : g
        );
        const customGroups = newCustom && !e.customGroups?.includes(newCustom)
          ? [...(e.customGroups || []), newCustom]
          : e.customGroups || [];
        return Object.assign({}, e, { guests: updated, customGroups });
      });
      setEditId(null);
      showToast("פרטי האורח עודכנו ✓");
    } else {
      const guestGate = canAddGuest(plan, ev.guests.length);
      if (!guestGate.allowed) {
        showToast(guestGate.reason + " — שדרג להוספת אורחים נוספים", "err");
        return;
      }
      const giftAmount = form.giftAmount !== "" && !isNaN(parseInt(form.giftAmount)) ? Math.max(0, parseInt(form.giftAmount)) : undefined;
      const newG = Object.assign({}, form, { id: uid(), name: form.name.trim(), count: form.count || 1, group, giftAmount });
      patchEvent(e => {
        const customGroups = newCustom && !e.customGroups?.includes(newCustom)
          ? [...(e.customGroups || []), newCustom]
          : e.customGroups || [];
        return Object.assign({}, e, { guests: e.guests.concat([newG]), customGroups });
      });
      showToast(form.name.trim() + " נוסף/ה לרשימה ✓");
    }
    const nextGroup = group !== "אחר" ? group : "משפחה קרובה";
    setForm(p => Object.assign({}, EF, { side: p.side, group: nextGroup }));
    setCustomGroupInput("");
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(EF);
    setCustomGroupInput("");
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const addFromList = () => {
    const names = listText
      .split(/\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (names.length === 0) return;
    if (maxGuests !== Infinity && ev.guests.length + names.length > maxGuests) {
      const remaining = Math.max(0, maxGuests - ev.guests.length);
      showToast(
        remaining === 0
          ? `הגעת למגבלת ${maxGuests} הרשומות בתוכנית הנוכחית — שדרג להוספת אורחים נוספים`
          : `ניתן להוסיף עוד ${remaining} רשומות בלבד בתוכנית הנוכחית (${ev.guests.length}/${maxGuests})`,
        "err"
      );
      return;
    }
    const newGuests = names.map(name => ({
      id: uid(), name, count: 1, side: listSide, group: listGroup,
      phone: "", notes: "", rsvp: "pending", meal: MEAL_DEFAULT,
    }));
    patchEvent(e => Object.assign({}, e, { guests: e.guests.concat(newGuests) }));
    showToast("נוספו " + newGuests.length + " אורחים ✓");
    setListText("");
    setShowList(false);
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const delGuest = (id, name) => {
    const tableId   = ev.seating[id];
    const tableName = tableId ? (ev.tables.find(t => t.id === tableId)?.name || null) : null;
    const msg = tableName
      ? "למחוק את \"" + name + "\"?\n\nהאורח שובץ לשולחן " + tableName + " — שיבוצו יוסר אוטומטית.\n\nפעולה זו אינה ניתנת לביטול."
      : "למחוק את \"" + name + "\" מרשימת האורחים?\n\nפעולה זו אינה ניתנת לביטול.";
    if (!confirm(msg)) return;
    if (editId === id) { setEditId(null); setForm(EF); setCustomGroupInput(""); }
    patchEvent(e => Object.assign({}, e, {
      guests:  e.guests.filter(g => g.id !== id),
      seating: Object.fromEntries(Object.entries(e.seating).filter(([gid]) => gid !== id)),
    }));
    showToast(name + " הוסר/ה מהרשימה ✓");
  };

  const RSVP_OPTIONS = [
    { value: "pending",   label: "ממתין",   style: { color: "var(--warn)" } },
    { value: "confirmed", label: "אישר/ה",  style: { color: "var(--green)" } },
    { value: "maybe",     label: "אולי",    style: { color: "var(--warn)" } },
    { value: "declined",  label: "סירב/ה",  style: { color: "var(--red)" } },
  ];
  const rsvpLabel = v => RSVP_OPTIONS.find(o => o.value === v)?.label || "ממתין";
  const mealLabel = v => MEAL_OPTIONS.find(o => o.value === v)?.label || "";
  const mealEmoji = v => MEAL_OPTIONS.find(o => o.value === v)?.emoji || "";

  // Open WhatsApp to a specific guest with a personal invite + event-site link.
  const siteUrl = window.location.origin + "/invite/" + (ev.tokens?.invite || "");
  // Normalize an Israeli phone to wa.me international form (972…) — handles
  // "05x-xxxxxxx", "+972…", "972…" and "00972…".
  const normalizePhone = (raw) => {
    let d = (raw || "").replace(/[^\d]/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("972")) return d;
    if (d.startsWith("0")) return "972" + d.slice(1);
    return d;
  };
  const waGuest = (guest) => {
    const phone = normalizePhone(guest.phone);
    const msg = `היי ${guest.name}! 💛\nאתם מוזמנים ל${ev.name || "אירוע שלנו"}.\nכל הפרטים ואישור הגעה כאן:\n${siteUrl}`;
    const base = phone ? `https://wa.me/${phone}` : "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  const visible = ev.guests.filter(g => {
    if (filter.side !== "all" && g.side !== filter.side) return false;
    if (filter.group !== "all" && g.group !== filter.group) return false;
    if (filter.rsvp !== "all" && (g.rsvp || "pending") !== filter.rsvp) return false;
    if (filter.search && !g.name.includes(filter.search)) return false;
    return true;
  });

  const bulkSetRsvp = (rsvpValue) => {
    const ids = new Set(visible.map(g => g.id));
    patchEvent(e => ({
      ...e,
      guests: e.guests.map(g => ids.has(g.id) ? { ...g, rsvp: rsvpValue } : g),
    }));
    const label = RSVP_OPTIONS.find(o => o.value === rsvpValue)?.label || rsvpValue;
    showToast(`${ids.size} אורחים עודכנו ל"${label}" ✓`);
  };

  const groups     = Array.from(new Set(ev.guests.map(g => g.group))).sort();
  const nBride     = ev.guests.filter(g => g.side === "bride").length;
  const nGroom     = ev.guests.filter(g => g.side === "groom").length;
  const nSeated    = ev.guests.filter(g => ev.seating[g.id]).length;
  const nConfirmed = ev.guests.filter(g => g.rsvp === "confirmed").length;
  const nDeclined  = ev.guests.filter(g => g.rsvp === "declined").length;
  const mealCounts = MEAL_OPTIONS.reduce((acc, o) => {
    const n = ev.guests.filter(g => (g.meal || MEAL_DEFAULT) === o.value).length;
    if (n > 0) acc.push({ ...o, n });
    return acc;
  }, []).filter(o => o.value !== MEAL_DEFAULT || o.n < ev.guests.length);
  const totalGifts   = ev.guests.reduce((s, g) => s + (g.giftAmount || 0), 0);
  const nGiftsLogged = ev.guests.filter(g => g.giftAmount > 0).length;
  const tableOf    = id => { const tid = ev.seating[id]; return tid ? ev.tables.find(t => t.id === tid) : null; };
  const isFiltered = filter.side !== "all" || filter.group !== "all" || filter.rsvp !== "all" || filter.search;

  return (
    <div className={base.page}>
      <PageHeader
        title="אורחים"
        icon={<Icon name="users" />}
        sub="נהל את רשימת האורחים. לחץ Enter להוספה מהירה."
        aside={
          <div className={base.pills}>
            <StatPill n={ev.guests.length} label="סה״כ" />
            <StatPill n={nBride} label={sideLabel("bride")} color="var(--bride)" />
            <StatPill n={nGroom} label={sideLabel("groom")} color="var(--groom)" />
            {nConfirmed > 0 && <StatPill n={nConfirmed} label="אישרו" color="var(--green)" />}
            {nDeclined > 0 && <StatPill n={nDeclined} label="סירבו" color="var(--red)" />}
            {nSeated > 0 && <StatPill n={nSeated} label="משובצים" color="var(--green)" />}
            {mealCounts.map(m => (
              <StatPill key={m.value} n={m.n} label={m.emoji + " " + m.label} />
            ))}
            {totalGifts > 0 && <StatPill n={"₪" + totalGifts.toLocaleString("he-IL")} label={"מתנות (" + nGiftsLogged + ")"} color="var(--green)" />}
          </div>
        }
      />

      <div className={styles.stepGuide}>
        <span className={styles.stepBadge}>שלב 3 מתוך 5 — אורחים</span>
        <span className={styles.stepText}>הוסיפו אורחים ידנית אחד-אחד, או ייבאו רשימה שלמה מ-Excel. לאחר מכן המשיכו לאילוצים. כל שינוי נשמר אוטומטית.</span>
      </div>

      {/* ── Guest limit upgrade tip ── */}
      {maxGuests !== Infinity && ev.guests.length >= maxGuests && (
        <p className={styles.upgradeTip}>
          🔒 הגעת למגבלת {maxGuests} הרשומות בתוכנית הנוכחית —{" "}
          <a href="/account" className={styles.upgradeTipLink}>שדרג את התוכנית</a>{" "}
          להוספת אורחים נוספים.
        </p>
      )}

      <div className={[base.card, editId ? base.cardEdit : ""].filter(Boolean).join(" ")}>
        <SectionLabel>
          {editId
            ? ("✏ עריכת אורח — " + (ev.guests.find(g => g.id === editId)?.name ?? ""))
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
          <Field label="כמות מקומות" hint="כמה מקומות תופסת הרשומה הזו">
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
            <select
              className={base.select}
              value={form.group}
              onChange={e => { setF("group", e.target.value); setCustomGroupInput(""); }}
            >
              {allGroupOptions.map(g => <option key={g}>{g}</option>)}
            </select>
            {form.group === "אחר" && (
              <div className={styles.customGroupRow}>
                <input
                  className={base.input}
                  value={customGroupInput}
                  placeholder="שם הקבוצה החדשה..."
                  autoFocus
                  onChange={e => setCustomGroupInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveGuest(); }}
                />
                <span className={styles.customGroupHint}>
                  הקבוצה תישמר לאירוע זה ותופיע בתפריט לאורחים הבאים.
                </span>
              </div>
            )}
          </Field>
        </div>

        <div className={base.grid2}>
          <Field label="סטטוס RSVP">
            <select className={base.select} value={form.rsvp || "pending"} onChange={e => setF("rsvp", e.target.value)}>
              {RSVP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="מנה">
            <select className={base.select} value={form.meal || MEAL_DEFAULT} onChange={e => setF("meal", e.target.value)}>
              {MEAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.emoji} {o.label}</option>)}
            </select>
          </Field>
        </div>
        <div className={base.grid2}>
          <Field label="הערות">
            <input
              className={base.input}
              value={form.notes}
              placeholder="מוגבלות, הערה כלשהי..."
              onChange={e => setF("notes", e.target.value)}
            />
          </Field>
          <Field label="סכום מתנה (₪)" hint="אופציונלי — לדוח גמ״ח">
            <input
              className={base.input}
              type="number"
              min="0"
              step="50"
              value={form.giftAmount}
              placeholder="0"
              onChange={e => setF("giftAmount", e.target.value)}
            />
          </Field>
        </div>

        <div className={base.formActions}>
          <button
            className={base.btnPrimary}
            onClick={saveGuest}
            disabled={!editId && maxGuests !== Infinity && ev.guests.length >= maxGuests}
            title={!editId && maxGuests !== Infinity && ev.guests.length >= maxGuests
              ? `הגעת למגבלת ${maxGuests} האורחים — שדרג את התוכנית`
              : undefined}
          >
            {editId ? "שמור שינויים" : "+ הוסף אורח"}
          </button>
          {editId && <button className={base.btnSecondary} onClick={cancelEdit}>ביטול</button>}
          {!editId && (
            <button className={base.btnSecondary} onClick={() => { setShowList(p => !p); setShowBulk(false); }}>
              {showList ? "סגור רשימה" : "📝 הוסף לפי רשימה"}
            </button>
          )}
          {!editId && (
            <button className={base.btnSecondary} onClick={() => { setShowBulk(p => !p); setShowList(false); }}>
              {showBulk ? "סגור ייבוא" : "📥 ייבוא מ-Excel"}
            </button>
          )}
          {!editId && <span className={base.fieldHint}>Enter = הוסף מהיר</span>}
        </div>

        {showList && !editId && (
          <div className={styles.listAddPanel}>
            <div className={styles.listAddTitle}>הוסף אורחים לפי רשימה</div>
            <p className={styles.listAddHint}>הכנס שם אחד בכל שורה. כל האורחים יקבלו את אותו הצד והקבוצה.</p>
            <textarea
              className={[base.input, styles.listAddTextarea].join(" ")}
              value={listText}
              onChange={e => setListText(e.target.value)}
              placeholder={"דוד לוי\nשרה כהן\nמשפחת אברהם\n..."}
              rows={6}
              autoFocus
            />
            <div className={styles.listAddRow}>
              <div className={base.seg}>
                {["bride", "groom"].map(s => (
                  <button
                    key={s}
                    className={[base.segBtn, listSide === s ? (s === "bride" ? base.segBride : base.segGroom) : ""].filter(Boolean).join(" ")}
                    onClick={() => setListSide(s)}
                  >
                    {sideLabel(s)}
                  </button>
                ))}
              </div>
              <select
                className={base.select}
                value={listGroup}
                onChange={e => setListGroup(e.target.value)}
              >
                {allGroupOptions.filter(g => g !== "אחר").map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className={base.btnPrimary}
                onClick={addFromList}
                disabled={!listText.trim()}
              >
                + הוסף {listText.trim() ? listText.split("\n").filter(s => s.trim()).length : 0} אורחים
              </button>
              <button className={base.btnSecondary} onClick={() => setShowList(false)}>ביטול</button>
            </div>
          </div>
        )}

        {showBulk && (
          <ExcelImportFlow
            ev={ev}
            patchEvent={patchEvent}
            showToast={showToast}
            onClose={() => setShowBulk(false)}
            maxGuests={maxGuests}
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
          <select className={base.select} style={{ minWidth: 120 }} value={filter.rsvp}
            onChange={e => setFilter(p => Object.assign({}, p, { rsvp: e.target.value }))}>
            <option value="all">כל הסטטוסים</option>
            {RSVP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {isFiltered ? (
            <>
              <span className={base.filterCount}>מציג {visible.length} מתוך {ev.guests.length}</span>
              <button className={[base.btnSm, base.btnGhost].join(" ")}
                onClick={() => setFilter({ side: "all", group: "all", rsvp: "all", search: "" })}>
                נקה ✕
              </button>
            </>
          ) : (
            <span className={base.filterCount}>{ev.guests.length} רשומות</span>
          )}
        </div>
      )}

      {isFiltered && visible.length > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkLabel}>עדכן {visible.length} מסוננים:</span>
          {RSVP_OPTIONS.map(o => (
            <button
              key={o.value}
              className={styles.bulkRsvpBtn}
              style={o.style}
              onClick={() => bulkSetRsvp(o.value)}
            >
              {o.label}
            </button>
          ))}
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
                    {g.meal && g.meal !== MEAL_DEFAULT ? " · " + mealEmoji(g.meal) + " " + mealLabel(g.meal) : ""}
                    {g.phone ? " · " + g.phone : ""}
                    {g.notes ? " · " + g.notes : ""}
                    {g.giftAmount > 0 ? " · 💰 ₪" + g.giftAmount.toLocaleString("he-IL") : ""}
                  </span>
                </div>
                {(g.rsvp === "confirmed" || g.rsvp === "declined" || g.rsvp === "maybe") && (
                  <span className={g.rsvp === "confirmed" ? base.tagSeated : base.tagUnseated}
                    style={
                      g.rsvp === "declined" ? { color: "var(--red)", borderColor: "var(--red)" } :
                      g.rsvp === "maybe"    ? { color: "var(--warn)", borderColor: "var(--warn-border)", background: "var(--warn-bg)" } :
                      undefined
                    }>
                    {rsvpLabel(g.rsvp)}
                  </span>
                )}
                {t
                  ? <span className={base.tagSeated}>⬡ {t.name}</span>
                  : <span className={base.tagUnseated}>לא שובץ</span>
                }
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {g.phone && (
                    <button
                      className={[base.btnSm, styles.waBtn].join(" ")}
                      title="שלח הזמנה בוואטסאפ"
                      onClick={() => waGuest(g)}
                    >
                      וואטסאפ
                    </button>
                  )}
                  <button className={[base.btnSm, base.btnGhost].join(" ")}
                    onClick={() => {
                      setForm({ name: g.name, side: g.side, group: g.group, count: g.count || 1, phone: g.phone || "", notes: g.notes || "", rsvp: g.rsvp || "pending", meal: g.meal || MEAL_DEFAULT, giftAmount: g.giftAmount || "" });
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
        <EmptyState icon={<Icon name="users" />} title="טרם נוספו אורחים"
          text='הוסיפו אורחים ידנית דרך הטופס למעלה, או לחצו על "ייבוא מ-Excel" לייבוא רשימה שלמה בבת אחת.' />
      )}
      {visible.length === 0 && ev.guests.length > 0 && (
        <EmptyState icon={<Icon name="search" />} title="אין תוצאות לסינון הנוכחי"
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
