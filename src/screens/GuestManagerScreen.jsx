import { useState, useEffect, useRef } from "react";
import InfoTip from "../components/ui/InfoTip.jsx";
import { messageSignature } from "../data/company.js";
import Icon from "../components/ui/Icon.jsx";
import { GROUP_OPTIONS, MEAL_OPTIONS, MEAL_DEFAULT } from "../data/constants.js";
import { getSideLabel } from "../utils/eventHelpers.js";
import { uid } from "../utils/uid.js";
import { usePlan } from "../hooks/usePlan.js";
import { canAddGuest } from "../utils/featureGates.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import SideDot from "../components/ui/SideDot.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./GuestManagerScreen.module.css";


export default function GuestManagerScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const EF = { name: "", side: "bride", group: "משפחה קרובה", count: 1, phone: "", notes: "", rsvp: "pending", meal: MEAL_DEFAULT, giftAmount: "", estGift: "", companions: [] };
  const [form, setForm]           = useState(EF);
  const [editId, setEditId]       = useState(null);
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
    // Keep only as many companion names as there are extra seats; drop blanks
    // at the tail but preserve positions so "מלווה 2" stays the second seat.
    const cnt = form.count || 1;
    const rawComp = (form.companions || []).slice(0, cnt - 1).map(c => (c || "").trim());
    while (rawComp.length && rawComp[rawComp.length - 1] === "") rawComp.pop();
    const companions = rawComp;
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
      const estGift = form.estGift !== "" && !isNaN(parseInt(form.estGift)) ? Math.max(0, parseInt(form.estGift)) : undefined;
      patchEvent(e => {
        const updated = e.guests.map(g =>
          g.id === editId ? Object.assign({}, g, form, { name: form.name.trim(), group, giftAmount, estGift, companions }) : g
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
        showToast(guestGate.reason + " — שדרגו להוספת אורחים נוספים", "err");
        return;
      }
      const giftAmount = form.giftAmount !== "" && !isNaN(parseInt(form.giftAmount)) ? Math.max(0, parseInt(form.giftAmount)) : undefined;
      const estGift = form.estGift !== "" && !isNaN(parseInt(form.estGift)) ? Math.max(0, parseInt(form.estGift)) : undefined;
      const newG = Object.assign({}, form, { id: uid(), name: form.name.trim(), count: form.count || 1, group, giftAmount, estGift, companions });
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
          ? `הגעתם למגבלת ${maxGuests} הרשומות בתוכנית הנוכחית — שדרגו להוספת אורחים נוספים`
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
    const collabNote = ev.tokens?.collab ? "\n\nהאורח יימחק גם מהטבלה השיתופית של המשפחה." : "";
    const msg = tableName
      ? "למחוק את \"" + name + "\"?\n\nהאורח שובץ לשולחן " + tableName + " — שיבוצו יוסר אוטומטית." + collabNote + "\n\nפעולה זו אינה ניתנת לביטול."
      : "למחוק את \"" + name + "\" מרשימת האורחים?" + collabNote + "\n\nפעולה זו אינה ניתנת לביטול.";
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

  // Excel is a report, not a workspace: one button that always downloads the
  // full, current guest list as a spreadsheet.
  const exportGuestsExcel = async () => {
    const XLSX = await import("xlsx");
    const rsvpTxt = { confirmed: "אישרו", declined: "לא מגיעים", maybe: "אולי", pending: "ממתין" };
    const aoa = [["שם מלא", "טלפון", "צד", "קבוצה", "כמות", "מנה", "אישור הגעה", "הערות"]];
    ev.guests.forEach(g => aoa.push([
      g.name || "", g.phone || "", sideLabel(g.side), g.group || "",
      g.count || 1, mealLabel(g.meal), rsvpTxt[g.rsvp || "pending"] || "", g.notes || "",
    ]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "רשימת אורחים");
    XLSX.writeFile(wb, `אורחים-${(ev.name || "אירוע").replace(/[^\p{L}\p{N} -]/gu, "")}.xlsx`);
  };

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
    const msg = `היי ${guest.name}! 💛\nאתם מוזמנים ל${ev.name || "אירוע שלנו"}.\nכל הפרטים ואישור הגעה כאן:\n${siteUrl}` + messageSignature();
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
        sub="נהלו את רשימת האורחים. לחצו Enter להוספה מהירה."
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
          🔒 הגעתם למגבלת {maxGuests} הרשומות בתוכנית הנוכחית —{" "}
          <a href="/account" className={styles.upgradeTipLink}>שדרגו את התוכנית</a>{" "}
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
            הוספה אחת בכל פעם. להוספה מהירה — "הוסיפו לפי רשימה", או "טבלה שיתופית למשפחה" שכולם ממלאים יחד.
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

        {(form.count || 1) > 1 && (
          <Field
            label={`שמות המגיעים עם ${form.name.trim() || "האורח"} (אופציונלי)`}
            hint="כדי לראות שם על כל כיסא בשולחן. מה שלא ימולא יוצג כ״+1 / +2״."
          >
            <div className={styles.companionsGrid}>
              {Array.from({ length: (form.count || 1) - 1 }).map((_, i) => (
                <input
                  key={i}
                  className={base.input}
                  value={(form.companions || [])[i] || ""}
                  placeholder={`מלווה ${i + 1}`}
                  onChange={e => {
                    const arr = [...(form.companions || [])];
                    arr[i] = e.target.value;
                    setF("companions", arr);
                  }}
                />
              ))}
            </div>
          </Field>
        )}

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
          <Field label={<>סטטוס הגעה <InfoTip text="לעדכון ידני של תשובות שקיבלתם בעצמכם (בטלפון או פנים־אל־פנים). אורחים שמאשרים דרך הקישור הדיגיטלי מתעדכנים אוטומטית — אין צורך לעדכן אותם כאן." /></>}>
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
          <Field label={<>מתנה משוערת (₪) <InfoTip text="אופציונלי. כמה אתם מעריכים שהאורח יכניס במתנה — הסכום מכל האורחים נכנס ל'הכנסה צפויה' במסך תכנון התקציב." /></>}>
            <input
              className={base.input}
              type="number"
              min="0"
              step="50"
              value={form.estGift}
              placeholder="0"
              onChange={e => setF("estGift", e.target.value)}
            />
          </Field>
          <Field label={<>מתנה שהתקבלה (₪) <InfoTip text="אופציונלי. אם כבר קיבלתם מתנה מהאורח — רשמו כאן את הסכום בפועל. נסכם לכם את סך המתנות שהתקבלו." /></>}>
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
              ? `הגעתם למגבלת ${maxGuests} האורחים — שדרגו את התוכנית`
              : undefined}
          >
            {editId ? "שמרו שינויים" : "+ הוסיפו אורח"}
          </button>
          {editId && <button className={base.btnSecondary} onClick={cancelEdit}>ביטול</button>}
          {!editId && (
            <button className={base.btnSecondary} onClick={() => setShowList(p => !p)}>
              {showList ? "סגרו רשימה" : "📝 הוסיפו לפי רשימה"}
            </button>
          )}
          {!editId && ev.guests.length > 0 && (
            <button className={base.btnSecondary} onClick={exportGuestsExcel}>
              ⬇ הורדה לאקסל
            </button>
          )}
          {!editId && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button className={base.btnSecondary} onClick={() => go("collab")}>
                👨‍👩‍👧 טבלה שיתופית למשפחה
              </button>
              <InfoTip text="שתפו קישור אחד עם המשפחה — כולם ממלאים את אותה טבלה יחד, בזמן אמת, בלי צורך במשתמש וסיסמה. כל רשומה מלאה נכנסת לכאן אוטומטית, ושינוי כאן מתעדכן אצלם. במקום לשלוח אקסל הלוך ושוב." />
            </span>
          )}
          {!editId && <span className={base.fieldHint}>Enter = הוספה מהירה</span>}
        </div>

        {showList && !editId && (
          <div className={styles.listAddPanel}>
            <div className={styles.listAddTitle}>הוסיפו אורחים לפי רשימה</div>
            <p className={styles.listAddHint}>הכניסו שם אחד בכל שורה. כל האורחים יקבלו את אותו הצד והקבוצה.</p>
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
                + הוסיפו {listText.trim() ? listText.split("\n").filter(s => s.trim()).length : 0} אורחים
              </button>
              <button className={base.btnSecondary} onClick={() => setShowList(false)}>ביטול</button>
            </div>
          </div>
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
                נקו ✕
              </button>
            </>
          ) : (
            <span className={base.filterCount}>{ev.guests.length} רשומות</span>
          )}
        </div>
      )}

      {isFiltered && visible.length > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkLabel}>עדכנו {visible.length} מסוננים:</span>
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
                      title="שלחו הזמנה בוואטסאפ"
                      onClick={() => waGuest(g)}
                    >
                      וואטסאפ
                    </button>
                  )}
                  <button className={[base.btnSm, base.btnGhost].join(" ")}
                    onClick={() => {
                      setForm({ name: g.name, side: g.side, group: g.group, count: g.count || 1, phone: g.phone || "", notes: g.notes || "", rsvp: g.rsvp || "pending", meal: g.meal || MEAL_DEFAULT, giftAmount: g.giftAmount || "", companions: Array.isArray(g.companions) ? g.companions : [] });
                      setEditId(g.id);
                      window.scrollTo(0, 0);
                    }}>
                    עריכה
                  </button>
                  <button className={[base.btnSm, base.btnDanger].join(" ")} onClick={() => delGuest(g.id, g.name)}>
                    מחקו
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ev.guests.length === 0 && (
        <EmptyState icon={<Icon name="users" />} title="טרם נוספו אורחים"
          text='הוסיפו אורחים ידנית דרך הטופס למעלה, "הוסיפו לפי רשימה" להוספה מהירה, או שתפו "טבלה שיתופית למשפחה".' />
      )}
      {visible.length === 0 && ev.guests.length > 0 && (
        <EmptyState icon={<Icon name="search" />} title="אין תוצאות לסינון הנוכחי"
          text='לחצו על "נקו" כדי לאפס את הסינון ולראות את כל האורחים.' />
      )}

      <NextStep
        label="המשיכו להגדרת אילוצים"
        hint={ev.constraints.length > 0
          ? (ev.constraints.length + " אילוצים מוגדרים")
          : "אופציונלי — הגדירו מי חייב / לא יכול לשבת יחד"}
        onClick={() => go("constraints")}
      />
    </div>
  );
}
