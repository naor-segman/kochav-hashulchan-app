import { useState, useEffect, useRef, useMemo } from "react";
import InfoTip from "../components/ui/InfoTip.jsx";
import { messageSignature } from "../data/company.js";
import { renderTemplate, whatsappLink } from "../data/messageSequence.js";
import Icon from "../components/ui/Icon.jsx";
import { GROUP_OPTIONS, BUSINESS_GROUP_OPTIONS, MEAL_OPTIONS, MEAL_DEFAULT } from "../data/constants.js";
import { getSideLabel } from "../utils/eventHelpers.js";
import { uid } from "../utils/uid.js";
import { parseGuestList, countWithPhone } from "../utils/parseGuestList.js";
import {
  emptyGuestForm, guestToForm, applyGuestForm, newGuestFromForm,
  companionsForCount, setCompanionAt, companionSlots,
} from "../utils/guestForm.js";
import { usePlan } from "../hooks/usePlan.js";
import { canAddGuest, guestSlotsLeft } from "../utils/featureGates.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import Field from "../components/ui/Field.jsx";
import NextStep from "../components/ui/NextStep.jsx";
import { buildStep, nextBuildStep, BUILD_STEP_COUNT } from "../data/eventAreas.js";
import PageHeader from "../components/ui/PageHeader.jsx";
import SectionLabel from "../components/ui/SectionLabel.jsx";
import SideDot from "../components/ui/SideDot.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import base from "../styles/screenBase.module.css";
import Divider from "../components/ui/Divider.jsx";
import styles from "./GuestManagerScreen.module.css";


export default function GuestManagerScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  // Position in the build order, from src/data/eventAreas.js — never a literal.
  const step = buildStep("guests");
  const next = nextBuildStep("guests");

  const { confirm, prompt, dialog } = useConfirm();
  // Corporate events use a business group set + default; everyone else the
  // family-oriented one. Custom groups (below) work regardless of type.
  const isBusiness   = ev.type === "אירוע עסקי";
  const baseGroups   = isBusiness ? BUSINESS_GROUP_OPTIONS : GROUP_OPTIONS;
  const defaultGroup = isBusiness ? BUSINESS_GROUP_OPTIONS[0] : "משפחה קרובה";
  const EF = emptyGuestForm(defaultGroup);
  const [form, setForm]           = useState(EF);
  const [editId, setEditId]       = useState(null);
  // Which of the three ways to add guests is open. The chooser sits at the TOP
  // of the screen: a host who types forty names by hand and only then discovers
  // the paste box and the shared link has been failed by the page.
  const [addWay, setAddWay]         = useState("manual"); // "manual" | "list"
  const showList                    = addWay === "list";
  const [listText, setListText]     = useState("");
  const [listSide, setListSide]     = useState("bride");
  const [listGroup, setListGroup]   = useState(defaultGroup);
  const [filter, setFilter]       = useState({ side: "all", group: "all", rsvp: "all", search: "" });
  const [customGroupInput, setCustomGroupInput] = useState("");
  const nameRef                   = useRef(null);
  const setF = (k, v) => setForm(p => Object.assign({}, p, { [k]: v }));

  // All group options: standard + event-level custom + any already on guests (legacy compat).
  // "אחר" is always last and acts as the trigger to create a new custom group.
  const allGroupOptions = Array.from(new Set([
    ...baseGroups.filter(g => g !== "אחר"),
    ...(ev.customGroups || []),
    ...ev.guests.map(g => g.group).filter(g => g && g !== "אחר" && !baseGroups.includes(g)),
    "אחר",
  ]));

  // Collab-table wording adapts to the event: "family" reads wrong for a
  // corporate event, so business events talk about "the team" instead.
  const collabWho   = isBusiness ? "הצוות" : "המשפחה";
  const collabWhoTo = isBusiness ? "לצוות" : "למשפחה";

  // Add a brand-new custom group to this event from anywhere a group is picked.
  // Saved to customGroups so it appears in every group list + the filter.
  const addCustomGroup = async (setSelected) => {
    const name = (await prompt("שם הקבוצה החדשה (למשל: חברים מהגן / צוות שיווק)", {
      placeholder: "שם הקבוצה",
      confirmLabel: "צרו קבוצה",
    }) || "").trim();
    if (!name) return;
    if (!allGroupOptions.includes(name)) {
      patchEvent(e => ({ ...e, customGroups: [...(e.customGroups || []), name] }));
    }
    setSelected(name);
  };
  const chooseListGroup = (value) =>
    value === "__addgroup__" ? addCustomGroup(setListGroup) : setListGroup(value);

  const { plan, limits } = usePlan();
  const { maxGuests } = limits;
  // Every cap question on this screen goes through here, so the screen cannot
  // disagree with itself about whether a limit applies.
  const slotsLeft = guestSlotsLeft(plan, ev.guests.length);
  const atCap     = slotsLeft === 0;

  // Focus the name field once, on mount. Depending on editId would yank focus
  // back to the top of the form every time the host starts editing a row.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      patchEvent(e => {
        // applyGuestForm merges onto the STORED row, so every field this form
        // does not own — arrival, the gift recorded at the door, a flag some
        // future screen adds — comes through untouched, and the companion names
        // it did not touch stay exactly as typed. See utils/guestForm.js.
        const updated = e.guests.map(g =>
          g.id === editId ? applyGuestForm(g, form, group) : g
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
      const newG = newGuestFromForm(form, uid(), group);
      patchEvent(e => {
        const customGroups = newCustom && !e.customGroups?.includes(newCustom)
          ? [...(e.customGroups || []), newCustom]
          : e.customGroups || [];
        return Object.assign({}, e, { guests: e.guests.concat([newG]), customGroups });
      });
      showToast(form.name.trim() + " נוסף/ה לרשימה ✓");
    }
    const nextGroup = group !== "אחר" ? group : defaultGroup;
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

  // Parsed live so the button can say exactly what will be added — including
  // how many phones were detected, which is the point of the paste.
  const parsedList      = useMemo(() => parseGuestList(listText), [listText]);
  const parsedWithPhone = countWithPhone(parsedList);

  const addFromList = () => {
    // Reads a name AND a phone per line, so a WhatsApp/spreadsheet paste lands
    // complete instead of leaving hundreds of numbers to type by hand.
    const allRows = parseGuestList(listText);
    if (allRows.length === 0) return;
    if (atCap) {
      showToast(`הגעתם למגבלת ${maxGuests} הרשומות בתוכנית הנוכחית — שדרגו להוספת אורחים נוספים`, "err");
      return;
    }
    // Take what fits rather than rejecting the whole paste. Refusing 400 names
    // because 80 fit left the host with nothing and no way to see which ones
    // would have gone in.
    const rows    = allRows.slice(0, slotsLeft);
    const skipped = allRows.length - rows.length;
    const newGuests = rows.map(r => ({
      id: uid(), name: r.name, count: 1, side: listSide, group: listGroup,
      phone: r.phone, notes: "", rsvp: "pending", meal: MEAL_DEFAULT,
    }));
    patchEvent(e => Object.assign({}, e, { guests: e.guests.concat(newGuests) }));
    const withPhone = countWithPhone(rows);
    showToast(
      "נוספו " + newGuests.length + " אורחים" +
      (withPhone ? ` (${withPhone} עם טלפון)` : "") +
      (skipped ? ` · ${skipped} לא נוספו — מגבלת ${maxGuests} רשומות בתוכנית` : "") + " ✓",
      skipped ? "warn" : undefined
    );
    setListText("");
    setAddWay("manual");
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const delGuest = async (id, name) => {
    const tableId   = ev.seating[id];
    const tableName = tableId ? (ev.tables.find(t => t.id === tableId)?.name || null) : null;
    const collabNote = ev.tokens?.collab ? `\n\nהאורח יימחק גם מהטבלה המשותפת של ${collabWho}.` : "";
    const msg = tableName
      ? "למחוק את \"" + name + "\"?\n\nהאורח שובץ לשולחן " + tableName + " — שיבוצו יוסר אוטומטית." + collabNote + "\n\nפעולה זו אינה ניתנת לביטול."
      : "למחוק את \"" + name + "\" מרשימת האורחים?" + collabNote + "\n\nפעולה זו אינה ניתנת לביטול.";
    if (!await confirm(msg, { danger: true, confirmLabel: "מחקו" })) return;
    if (editId === id) { setEditId(null); setForm(EF); setCustomGroupInput(""); }
    patchEvent(e => Object.assign({}, e, {
      guests:  e.guests.filter(g => g.id !== id),
      seating: Object.fromEntries(Object.entries(e.seating).filter(([gid]) => gid !== id)),
      // Constraints too. ConstraintsScreen hides rows whose guest is gone, but
      // autoAssign still unions through them — so two guests stayed glued
      // together by a rule the host could no longer see or delete, and a third
      // guest could be left unseated by it. The collab delete path already did
      // this; the two were out of step.
      constraints:  (e.constraints  || []).filter(c => c.guestA !== id && c.guestB !== id),
      lockedGuests: (e.lockedGuests || []).filter(g => g !== id),
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
  // Was a second copy of the phone normaliser with its own divergences (no
  // minimum length, so "050" produced wa.me/97250) and a raw `ל${ev.name}`,
  // which reads "להחתונה של דנה" — in Hebrew the attached ל absorbs the
  // definite article. renderTemplate + whatsappLink already handle both, and
  // they are the versions that have tests.
  const waGuest = (guest) => {
    const msg = renderTemplate(
      "היי {{שם}}! 💛\nאתם מוזמנים ל{{אירוע}}.\nכל הפרטים ואישור הגעה כאן:\n{{קישור}}",
      { event: ev, guest, link: siteUrl }
    ) + messageSignature();
    const url = whatsappLink(guest.phone, msg);
    window.open(url || ("https://wa.me/?text=" + encodeURIComponent(msg)), "_blank", "noopener");
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
  const tableOf    = id => { const tid = ev.seating[id]; return tid ? ev.tables.find(t => t.id === tid) : null; };
  const isFiltered = filter.side !== "all" || filter.group !== "all" || filter.rsvp !== "all" || filter.search;

  return (
    <div className={base.page}>
      {dialog}
      <PageHeader
        title="אורחים"
        mark="guests"
        /* What this screen IS, in one line — because the owner's hosts kept
           trying to answer questions here that only the guest can answer. */
        sub="רשימת המוזמנים: מי הוזמן, מאיזה צד, וכמה מקומות לשמור לו. מי באמת הגיע ומה הוא נתן נרשם ביום האירוע."
        aside={
          /* Four numbers, one of them leading. The sides and the meal
             breakdown moved to the quiet strip below the header: eleven equal
             boxes in five ink colours gave the eye nowhere to land. */
          <div className={base.pills}>
            <StatPill n={ev.guests.length} label="סה״כ" primary />
            {nConfirmed > 0 && <StatPill n={nConfirmed} label="אישרו" color="var(--green)" />}
            {nDeclined > 0 && <StatPill n={nDeclined} label="סירבו" color="var(--red)" />}
            {nSeated > 0 && <StatPill n={nSeated} label="משובצים" color="var(--green)" />}
          </div>
        }
      />

      {ev.guests.length > 0 && (
        <div className={base.statStrip}>
          <span className={base.statStripLabel}>פילוח:</span>
          <span className={base.statChip}>
            <SideDot side="bride" /><span className={base.statChipN}>{nBride}</span> {sideLabel("bride")}
          </span>
          <span className={base.statChip}>
            <SideDot side="groom" /><span className={base.statChipN}>{nGroom}</span> {sideLabel("groom")}
          </span>
          {mealCounts.map(m => (
            <span key={m.value} className={base.statChip}>
              <span className={base.statChipN}>{m.n}</span> {m.label}
            </span>
          ))}
        </div>
      )}

      <div className={base.stepGuide}>
        {/* From the model — see the note in TableBuilderScreen. */}
        <span className={base.stepBadge}>
          {"שלב " + step.num + " מתוך " + BUILD_STEP_COUNT + " — " + step.label}
        </span>
        <span className={base.stepText}>בחרו למטה איך להכניס את המוזמנים: להקליד אחד-אחד, להדביק רשימה שכבר יש לכם, או לשלוח קישור שהמשפחה תמלא במקומכם. אחר כך ממשיכים לשולחנות. הכל נשמר לבד.</span>
      </div>

      {/* ── Guest limit upgrade tip ── */}
      {atCap && (
        <p className={styles.upgradeTip}>
          <Icon name="lock" /> הגעתם למגבלת {maxGuests} הרשומות בתוכנית הנוכחית —{" "}
          <a href="/account" className={styles.upgradeTipLink}>שדרגו את התוכנית</a>{" "}
          להוספת אורחים נוספים.
        </p>
      )}

      {/* ── The three ways in — FIRST, because they are what the page is for ──
          They used to sit under the manual form: a host typed forty names by
          hand and only then met the paste box and the shared link. Each option
          is titled by what HAPPENS, not by what it is called. */}
      {!editId && (
        <div className={styles.ways}>
          <SectionLabel>איך להכניס את המוזמנים לרשימה</SectionLabel>
          <div className={styles.waysGrid}>
            <button
              type="button"
              className={[styles.way, addWay === "manual" ? styles.wayOn : ""].filter(Boolean).join(" ")}
              aria-pressed={addWay === "manual"}
              onClick={() => { setAddWay("manual"); setTimeout(() => nameRef.current && nameRef.current.focus(), 50); }}
            >
              <span className={styles.wayIcon}><Icon name="edit" size={18} /></span>
              <span className={styles.wayTitle}>להקליד בעצמכם, שורה-שורה</span>
              <span className={styles.wayText}>
                אתם ממלאים שם, טלפון וכמה מקומות לשמור. הצד והקבוצה נשארים כפי שבחרתם,
                כך שאפשר להזין משפחה שלמה ברצף.
              </span>
            </button>

            <button
              type="button"
              className={[styles.way, addWay === "list" ? styles.wayOn : ""].filter(Boolean).join(" ")}
              aria-pressed={addWay === "list"}
              onClick={() => setAddWay("list")}
            >
              <span className={styles.wayIcon}><Icon name="clipboard" size={18} /></span>
              <span className={styles.wayTitle}>להדביק רשימה שכבר יש לכם</span>
              <span className={styles.wayText}>
                שמות בהודעת וואטסאפ, בפתק או בגיליון — מדביקים הכל בבת אחת, שם אחד בכל שורה.
                טלפון שנמצא באותה שורה נקלט לבד. כולם נכנסים לאותו צד ולאותה קבוצה.
              </span>
            </button>

            <button
              type="button"
              className={styles.way}
              onClick={() => go("collab")}
            >
              <span className={styles.wayIcon}><Icon name="link" size={18} /></span>
              <span className={styles.wayTitle}>לשלוח קישור {collabWhoTo} — והם ממלאים</span>
              <span className={styles.wayText}>
                שולחים קישור אחד בוואטסאפ. כל מי שפותח אותו מוסיף את המוזמנים שלו לאותה טבלה,
                בלי הרשמה ובלי סיסמה. כל שורה שהושלמה מופיעה כאן מיד — ולא צריך לאסוף אקסלים.
              </span>
            </button>
          </div>
        </div>
      )}

      <div className={[base.card, editId ? base.cardEdit : ""].filter(Boolean).join(" ")}>
        <SectionLabel>
          {editId
            ? ("עריכת אורח — " + (ev.guests.find(g => g.id === editId)?.name ?? ""))
            : showList ? "הדביקו את הרשימה" : "הוספת אורח"}
        </SectionLabel>

        {showList && !editId ? (
          <div className={styles.listAddPanel}>
            <p className={styles.listAddHint}>
              שם אחד בכל שורה. אם יש בשורה גם מספר טלפון — הוא ייקלט לשדה הטלפון לבד,
              לא צריך לסדר כלום מראש. בחרו למטה לאיזה צד ולאיזו קבוצה כולם שייכים;
              אפשר לשנות לכל אחד בנפרד אחר כך.
            </p>
            <textarea
              className={[base.input, styles.listAddTextarea].join(" ")}
              value={listText}
              onChange={e => setListText(e.target.value)}
              placeholder={"דוד לוי\nשרה כהן, 050-1234567\n~משפחת אברהם\t0521234567\n..."}
              rows={6}
              autoFocus
              aria-label="הדביקו כאן את רשימת השמות"
            />
            <div className={styles.listAddRow}>
              <div className={base.seg}>
                {["bride", "groom"].map(s => (
                  <button
                    key={s}
                    type="button"
                    className={[base.segBtn, listSide === s ? (s === "bride" ? base.segBride : base.segGroom) : ""].filter(Boolean).join(" ")}
                    onClick={() => setListSide(s)}
                  >
                    {sideLabel(s)}
                  </button>
                ))}
              </div>
              <select
                className={base.select}
                aria-label="הקבוצה שכל השמות ברשימה יקבלו"
                value={listGroup}
                onChange={e => chooseListGroup(e.target.value)}
              >
                {allGroupOptions.filter(g => g !== "אחר").map(g => <option key={g} value={g}>{g}</option>)}
                <option value="__addgroup__">+ קבוצה חדשה…</option>
              </select>
            </div>
            <div className={base.formActions}>
              <button
                className={base.btnPrimary}
                onClick={addFromList}
                disabled={parsedList.length === 0}
              >
                + הוסיפו {parsedList.length} אורחים
                {parsedWithPhone > 0 ? ` (${parsedWithPhone} עם טלפון)` : ""}
              </button>
              <button className={base.btnSecondary} onClick={() => setAddWay("manual")}>ביטול</button>
            </div>
          </div>
        ) : (
        <>
        {/* Assignment first, name second — the owner's correction. Entering a
            family means picking the side and the group ONCE and then typing
            name after name; asking for the name first put the sticky choice
            after the thing that changes every time. */}
        <Divider label="למי משייכים?" />

        <div className={base.grid2}>
          <Field label="מי הזמין אותם" hint="לפי זה נדע לשבת אותם באזור הנכון באולם">
            <div className={base.seg}>
              {["bride", "groom"].map(s => (
                <button
                  key={s}
                  type="button"
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
          <Field label="קבוצה" hint="הסידור האוטומטי מושיב את אותה קבוצה יחד">
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
                  הקבוצה תישמר לאירוע הזה ותופיע בתפריט לכל אורח הבא.
                </span>
              </div>
            )}
          </Field>
        </div>

        <Divider label="מי מגיע?" />

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
          <Field label="טלפון" hint="לשליחת ההזמנה ואישור ההגעה בוואטסאפ">
            <input className={base.input} value={form.phone} placeholder="050-0000000"
              onChange={e => setF("phone", e.target.value)} />
          </Field>
          <Field label="כמה כיסאות לשמור" hint="האורח עצמו + כל מי שמגיע איתו">
            <input className={base.input} type="number" min="1" max="50" value={form.count || 1}
              onChange={e => setF("count", Math.max(1, parseInt(e.target.value) || 1))} />
          </Field>
        </div>

        {companionSlots(form.count) > 0 && (
          <Field
            /* The owner's wording: the field has to say WHO these people are.
               "שמות המלווים" told a first-time host nothing. */
            label={`מי ${companionSlots(form.count)} האנשים שמצטרפים ${form.name.trim() ? "ל" + form.name.trim() : "לרשומה הזו"}?`}
            hint="אפשר לדלג — אבל שם על כל כיסא הוא מה שמאפשר לשבת אותם נכון, ולדיילת בכניסה לזהות אותם. בלי שם הכיסא יופיע כ״+1״."
          >
            <div className={styles.companionsGrid}>
              {companionsForCount(form.companions, form.count).map((val, i) => (
                <input
                  key={i}
                  className={base.input}
                  value={val}
                  placeholder={`שם ${i + 1}`}
                  aria-label={`שם המצטרף ${i + 1}`}
                  /* One name at a time: setCompanionAt keeps every other
                     position exactly as it was. */
                  onChange={e => setF("companions", setCompanionAt(form.companions, i, e.target.value))}
                />
              ))}
            </div>
          </Field>
        )}

        <Divider label="לא חובה" />

        <div className={base.grid2}>
          <Field label="הערה" hint="מה שחשוב לזכור עליהם">
            <input
              className={base.input}
              value={form.notes}
              placeholder="נגישות, אלרגיה, בקשה מיוחדת..."
              onChange={e => setF("notes", e.target.value)}
            />
          </Field>
          <Field label={<>מתנה משוערת (₪) <InfoTip text="הערכה שלכם מראש, לא סכום שהתקבל. הסכום מכל האורחים מרכיב את 'ההכנסה הצפויה' במסך התקציב, כדי שתדעו איפה אתם עומדים מול העלויות. מה שיתקבל בפועל נרשם ביום האירוע במסך הצ׳ק אין." /></>}>
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
        </div>

        {/* Only when correcting an existing row. These two are ANSWERS the
            guest gave, not details the host knows while building the list —
            so they are not part of adding a guest, and they are visibly
            separated from the fields that are. */}
        {editId && (
          <>
            <Divider label="מה שהאורח מסר" />
            <p className={styles.answersNote}>
              אלה נקבעים מאישור ההגעה של האורח. שנו כאן רק כדי לתקן — למשל אם ענו לכם בטלפון.
            </p>
            <div className={base.grid2}>
              <Field label={<>אישור הגעה <InfoTip text="אורח שעונה דרך קישור אישור ההגעה מתעדכן כאן לבד. השדה הזה קיים כדי לתקן תשובה שקיבלתם בדרך אחרת." /></>}>
                <select className={base.select} value={form.rsvp || "pending"} onChange={e => setF("rsvp", e.target.value)}>
                  {RSVP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={<>מנה <InfoTip text="מנה מיוחדת שהאורח ביקש. הספירה למטה היא מה שמזמינים מהקייטרינג. נכון להיום השדה הזה ממולא כאן ידנית — טופס אישור ההגעה עדיין לא שואל עליו." /></>}>
                <select className={base.select} value={form.meal || MEAL_DEFAULT} onChange={e => setF("meal", e.target.value)}>
                  {MEAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
          </>
        )}

        <div className={base.formActions}>
          <button
            className={base.btnPrimary}
            onClick={saveGuest}
            disabled={!editId && atCap}
            title={!editId && atCap
              ? `הגעתם למגבלת ${maxGuests} האורחים — שדרגו את התוכנית`
              : undefined}
          >
            {editId ? "שמרו שינויים" : "+ הוסיפו אורח"}
          </button>
          {editId && <button className={base.btnSecondary} onClick={cancelEdit}>ביטול</button>}
          {!editId && <span className={base.fieldHint}>Enter בשדה השם = הוספה ומעבר לאורח הבא</span>}
        </div>
        </>
        )}
      </div>

      {ev.guests.length > 0 && (
        <div className={base.filterBar}>
          <span className={styles.filterLabel}>סינון:</span>
          <input
            className={base.input}
            style={{ flex: 1, minWidth: 120 }}
            value={filter.search}
            placeholder="חיפוש לפי שם..."
            onChange={e => setFilter(p => Object.assign({}, p, { search: e.target.value }))}
          />
          <select className={base.select} aria-label="סינון לפי צד" style={{ minWidth: 130 }} value={filter.side}
            onChange={e => setFilter(p => Object.assign({}, p, { side: e.target.value }))}>
            <option value="all">כל הצדדים</option>
            <option value="bride">{sideLabel("bride")}</option>
            <option value="groom">{sideLabel("groom")}</option>
          </select>
          <select className={base.select} aria-label="סינון לפי קבוצה" style={{ minWidth: 140 }} value={filter.group}
            onChange={e => setFilter(p => Object.assign({}, p, { group: e.target.value }))}>
            <option value="all">כל הקבוצות</option>
            {groups.map(g => <option key={g}>{g}</option>)}
          </select>
          <select className={base.select} aria-label="סינון לפי סטטוס הגעה" style={{ minWidth: 120 }} value={filter.rsvp}
            onChange={e => setFilter(p => Object.assign({}, p, { rsvp: e.target.value }))}>
            <option value="all">כל הסטטוסים</option>
            {RSVP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {isFiltered ? (
            <>
              <span className={base.filterCount}>מציג {visible.length} מתוך {ev.guests.length}</span>
              <button className={[base.btnSm, base.btnGhost].join(" ")}
                onClick={() => setFilter({ side: "all", group: "all", rsvp: "all", search: "" })}>
                נקו <Icon name="close" size={12} />
              </button>
            </>
          ) : (
            <span className={base.filterCount}>{ev.guests.length} רשומות</span>
          )}
          {/* The export belongs to the LIST, not to the add form it used to sit
              in — you download what you are looking at. */}
          <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={exportGuestsExcel}>
            <Icon name="download" size={12} /> הורדה לאקסל
          </button>
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
                    {g.meal && g.meal !== MEAL_DEFAULT ? " · " + mealLabel(g.meal) : ""}
                    {g.phone ? " · " + g.phone : ""}
                    {g.notes ? " · " + g.notes : ""}
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
                  ? (
                    <span className={[base.tagSeated, base.tagFlexible].join(" ")} title={t.name}>
                      <Icon name="hexagon" size={12} />
                      <span className={base.tagFlexibleText}>{t.name}</span>
                    </span>
                  )
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
                      // Every editable field is loaded from the row, companion
                      // names included and padded to the seat count — a field
                      // the form renders but does not load is a field the host
                      // is being invited to blank out by accident.
                      setForm(guestToForm(g, defaultGroup));
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
        <EmptyState mark="guests" title="עוד לא נוסף אף מוזמן"
          text={`בחרו למעלה איך להתחיל: להקליד שורה-שורה, להדביק רשימה שכבר יש לכם, או לשלוח קישור ${collabWhoTo} שימלאו במקומכם.`} />
      )}
      {visible.length === 0 && ev.guests.length > 0 && (
        <EmptyState icon={<Icon name="search" />} title="אין תוצאות לסינון הנוכחי"
          text='לחצו על "נקו" כדי לאפס את הסינון ולראות את כל האורחים.' />
      )}

      <NextStep
        label={"המשיכו ל" + next.label}
        hint={ev.tables.length === 0 ? "כמה שולחנות יש באולם ומה הקיבולת שלהם"
          : ev.tables.length === 1 ? "שולחן אחד מוגדר"
          : ev.tables.length + " שולחנות מוגדרים"}
        onClick={() => go(next.id)}
      />
    </div>
  );
}
