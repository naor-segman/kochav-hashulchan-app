import { useState, useLayoutEffect, useRef, useMemo, useCallback, memo } from "react";
import InfoTip from "../components/ui/InfoTip.jsx";
import { messageSignature } from "../data/company.js";
import { renderTemplate, whatsappLink, linkForStage } from "../data/messageSequence.js";
import { useShareGate } from "../components/share/useShareGate.jsx";
import Icon from "../components/ui/Icon.jsx";
import { GROUP_OPTIONS, BUSINESS_GROUP_OPTIONS, MEAL_OPTIONS, MEAL_DEFAULT, GROUP_NAME_MAX } from "../data/constants.js";
import { getSideLabel, guestCompanionNames } from "../utils/eventHelpers.js";
import { uid } from "../utils/uid.js";
import { guestListSheetRows, GUEST_SHEET_COLS } from "../utils/guestListSheet.js";
import { parseGuestList, countWithPhone, countSeats } from "../utils/parseGuestList.js";
import { buildImportRows, readyImportRows } from "../utils/importReview.js";
import ImportReview from "../components/guests/ImportReview.jsx";
import {
  emptyGuestForm, guestToForm, applyGuestForm, newGuestFromForm,
  companionsForCount, setCompanionAt, companionSlots,
  missingCompanionSeats, COMPANION_NAME_HINT,
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


/* One row of the guest list (סב58).
 *
 * The rows used to be inline JSX in the screen, and the add form's state lives
 * in the screen too — so every keystroke in the name field re-rendered all of
 * them. Measured with 800 guests at 4x CPU throttle: ~240ms from keydown to
 * paint, per character. A memoised row with stable callbacks lets React skip
 * every row whose guest, table and labels did not change, which on a keystroke
 * is all of them. The props are plain values (the labels are computed by the
 * screen as strings) so the memo comparison holds. */
const GuestRow = memo(function GuestRow({ g, table: t, isEditing, sideText, mealText, rsvpText, onWa, onEdit, onDelete }) {
  const companions = guestCompanionNames(g);
  return (
    <div className={[base.gRow, styles.gRowLazy, isEditing ? base.gRowActive : ""].filter(Boolean).join(" ")}>
      <SideDot side={g.side} />
      <div className={base.gInfo}>
        <span className={base.gName}>
          {g.name}
          {(g.count || 1) > 1 && <span className={base.gCountBadge}>+{(g.count || 1) - 1}</span>}
        </span>
        {/* The names were being stored and never shown. A pasted row
            of "דניאל ישראל (אודליה,מיכאל,אריאל) 053…" parsed
            correctly — companions and all — and then the list drew
            "+3" and nothing else, so the only way to find out whether
            the paste had understood anything was to open the edit
            form row by row. The seating screen and the table card had
            shown these all along; the guest list was the one place
            that hadn't. */}
        {companions.length > 0 && (
          <span className={base.gCompanions}>
            {companions.join(" · ")}
          </span>
        )}
        <span className={base.gMeta}>
          {sideText} · {g.group}
          {(g.count || 1) > 1 ? " · " + (g.count) + " מקומות" : ""}
          {mealText ? " · " + mealText : ""}
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
          {rsvpText}
        </span>
      )}
      {t
        ? (
          <span className={[base.tagSeated, base.tagFlexible].join(" ")} title={t.name}>
            <Icon name="hexagon" size={12} />
            <span className={base.tagFlexibleText}>{t.name}</span>
          </span>
        )
        : <span className={base.tagUnseated}>טרם שובץ לשולחן</span>
      }
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {g.phone && (
          <button
            type="button"
            className={[base.btnSm, styles.waBtn].join(" ")}
            title="שלחו הזמנה בוואטסאפ"
            aria-label={`וואטסאפ: ${g.name}`}
            onClick={() => onWa(g)}
          >
            וואטסאפ
          </button>
        )}
        {/* Named with the guest (AX8): a list of 300 "עריכה" and 300
            "מחקו" buttons is unusable by screen reader, and the
            delete one is the dangerous one. The visible word leads
            the name, so voice control still finds it. */}
        <button type="button" className={[base.btnSm, base.btnGhost].join(" ")}
          aria-label={`עריכה: ${g.name}`}
          onClick={() => onEdit(g)}>
          עריכה
        </button>
        <button type="button" className={[base.btnSm, base.btnDanger].join(" ")} aria-label={`מחקו: ${g.name}`} onClick={() => onDelete(g.id, g.name)}>
          מחקו
        </button>
      </div>
    </div>
  );
});

export default function GuestManagerScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  // Position in the build order, from src/data/eventAreas.js — never a literal.
  const step = buildStep("guests");
  const next = nextBuildStep("guests");

  const { confirm, prompt, dialog } = useConfirm();
  const { guard, gate } = useShareGate();
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
  // null = still pasting. An array = the host is looking at what we understood.
  // Nothing reaches ev.guests while this is set.
  const [reviewRows, setReviewRows] = useState(null);
  const [listSide, setListSide]     = useState("bride");
  const [listGroup, setListGroup]   = useState(defaultGroup);
  const [filter, setFilter]       = useState({ side: "all", group: "all", rsvp: "all", search: "" });
  const [customGroupInput, setCustomGroupInput] = useState("");
  const nameRef                   = useRef(null);
  // One ref per companion box, so a refused save can put the cursor in the
  // empty one instead of leaving the host to hunt for it.
  const companionRefs             = useRef([]);
  const groupInputRef             = useRef(null);
  /* Where a refused save says why (136 stage D: "שגיאה ליד השדה"). These were
     toasts — at the bottom of the screen, gone in three seconds, while the
     field that needed fixing was somewhere above. Keyed by field; cleared as
     soon as the host edits that field. */
  const [errors, setErrors]       = useState({});
  // The seat count as TYPED: emptying the box snapped it straight back to 1,
  // so selecting "1" and typing "3" made 13 (the RSVP form fixed the same).
  const [countText, setCountText] = useState(null);
  const setF = (k, v) => {
    setForm(p => Object.assign({}, p, { [k]: v }));
    setErrors(e => (e[k] ? Object.assign({}, e, { [k]: null }) : e));
  };

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
      maxLength: GROUP_NAME_MAX,
    }) || "").trim();
    if (!name) return;
    if (!allGroupOptions.includes(name)) {
      patchEvent(e => ({ ...e, customGroups: [...(e.customGroups || []), name] }));
    }
    setSelected(name);
  };
  const chooseListGroup = (value) =>
    value === "__addgroup__" ? addCustomGroup(setListGroup) : setListGroup(value);

  // Scoped to this event — see usePlan's header. (Every guest cap is Infinity
  // today, so nothing here changes behaviour; it changes which question is
  // being asked, so it stays right when a cap returns.)
  const { plan, limits } = usePlan(ev);
  const { maxGuests } = limits;
  // Every cap question on this screen goes through here, so the screen cannot
  // disagree with itself about whether a limit applies.
  const slotsLeft = guestSlotsLeft(plan, ev.guests.length);
  const atCap     = slotsLeft === 0;
  /* The number the cap messages below print. `maxGuests` is Infinity on every
     plan today, and the five places that interpolated it raw would have rendered
     "הגעתם למגבלת Infinity הרשומות" — an English word in a Hebrew toast, on the
     screen where a host pastes their list. Double-unreachable right now (every
     message sits behind `atCap`, and slotsLeft is Infinity both when the gates
     are off and when maxGuests is), so this guards the day a row cap returns
     rather than fixing something a host can see. */
  const capLabel  = maxGuests === Infinity ? "הרשומות" : `${maxGuests} הרשומות`;

  /* No focus on mount (audit 3.10, V6). The name field sits under the "how to
     add guests" choice, the summary and the side picker, and focusing it on
     arrival scrolled the page ~1,070px down past all of it on a phone — and
     opened the keyboard — before the host had chosen anything. The field is
     focused when the host picks "פשוט להקליד בעצמכם", and after each save. */

  const sideLabel = s => getSideLabel(ev, s);

  const resolveGroup = () => {
    if (form.group !== "אחר") return { group: form.group, newCustom: null };
    const name = customGroupInput.trim();
    if (!name) return { group: "אחר", newCustom: null };
    return { group: name, newCustom: name };
  };

  /* Focus the field the error is about AND bring it, with its error line,
     to the middle of the screen. focus() alone does not scroll a field that
     counts as visible — and one sitting under the sticky bar counts: at 1280
     the field and its error were both behind the 107px header, at 390 half
     behind the 62px bar (review 6.10). */
  const focusField = (el) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  };

  const saveGuest = () => {
    if (!form.name.trim()) {
      setErrors({ name: "כתבו את שם האורח — בלי שם אי אפשר לשמור" });
      focusField(nameRef.current);
      return;
    }
    const { group, newCustom } = resolveGroup();
    if (form.group === "אחר" && !customGroupInput.trim()) {
      setErrors({ group: "תנו שם לקבוצה החדשה" });
      focusField(groupInputRef.current);
      return;
    }
    // Every extra seat needs a name (12.8). This form has an explicit save, so
    // it is the ONE place where the rule can be a real block without risking
    // anybody's typing — the shared table auto-saves and the RSVP form belongs
    // to a stranger, so both of those are handled differently and on purpose.
    // The message says what to type; it never says the host did something wrong.
    const unnamed = missingCompanionSeats(form.companions, form.count);
    if (unnamed.length) {
      setErrors({ companions: `חסר שם לאחד המקומות — ${COMPANION_NAME_HINT}.` });
      focusField(companionRefs.current[unnamed[0] - 1]);
      return;
    }
    setErrors({});
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
    setCountText(null);
    setCustomGroupInput("");
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(EF);
    setErrors({});
    setCountText(null);
    setCustomGroupInput("");
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  // Parsed live so the button can say exactly what will be added — including
  // how many phones were detected, which is the point of the paste.
  const parsedList      = useMemo(() => parseGuestList(listText), [listText]);
  const parsedWithPhone = countWithPhone(parsedList);
  // Rows and SEATS are different numbers the moment a line says "+1", and the
  // seats are what the tables have to hold — so the button says both.
  const parsedSeats     = countSeats(parsedList);

  /**
   * Paste -> REVIEW, never paste -> guests.
   *
   * The import used to commit blind, which is what made a wrong guess into a
   * mess the host found a week later. Now the parse result is shown first and
   * nothing touches ev.guests until they confirm it.
   */
  const reviewFromList = () => {
    const parsed = parseGuestList(listText);
    if (parsed.length === 0) return;
    if (atCap) {
      showToast(`הגעתם למגבלת ${capLabel} בתוכנית הנוכחית — שדרגו להוספת אורחים נוספים`, "err");
      return;
    }
    setReviewRows(buildImportRows(parsed, ev.guests));
  };

  const addFromList = () => {
    // Whatever the host left in the review is what gets added — their
    // corrections, not our guesses.
    const allRows = readyImportRows(reviewRows || []);
    if (allRows.length === 0) return;
    if (atCap) {
      showToast(`הגעתם למגבלת ${capLabel} בתוכנית הנוכחית — שדרגו להוספת אורחים נוספים`, "err");
      return;
    }
    // Take what fits rather than rejecting the whole paste. Refusing 400 names
    // because 80 fit left the host with nothing and no way to see which ones
    // would have gone in.
    const rows    = allRows.slice(0, slotsLeft);
    const skipped = allRows.length - rows.length;
    const newGuests = rows.map(r => ({
      // "עמיר סגמן+1 (יובל סגמן)" is ONE row of TWO seats — count is the seats
      // and companions the other names, exactly as the edit form stores them.
      // Hard-coding count: 1 here is what threw every "+1" in a pasted list
      // away, silently, along with the companion's name.
      id: uid(), name: r.name, count: r.count || 1, side: listSide, group: listGroup,
      phone: r.phone, notes: r.notes || "", rsvp: "pending", meal: MEAL_DEFAULT,
      companions: r.companions || [],
    }));
    patchEvent(e => Object.assign({}, e, { guests: e.guests.concat(newGuests) }));
    const withPhone = countWithPhone(rows);
    const seats     = countSeats(rows);
    showToast(
      "נוספו " + newGuests.length + " אורחים" +
      (seats > newGuests.length ? ` · ${seats} מקומות` : "") +
      (withPhone ? ` · ${withPhone} עם טלפון` : "") +
      (skipped ? ` · ${skipped} לא נוספו — מגבלת ${capLabel} בתוכנית` : "") + " ✓",
      skipped ? "warn" : undefined
    );
    setListText("");
    setReviewRows(null);
    setAddWay("manual");
    setTimeout(() => nameRef.current && nameRef.current.focus(), 50);
  };

  const delGuest = async (id, name) => {
    const tableId   = ev.seating[id];
    const tableName = tableId ? (ev.tables.find(t => t.id === tableId)?.name || null) : null;
    const collabNote = ev.tokens?.collab ? `\n\nהאורח יימחק גם מהטבלה השיתופית של ${collabWho}.` : "";
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
    // Rows built in utils/guestListSheet.js — which also carries the
    // companion names this export used to drop (89).
    const ws = XLSX.utils.aoa_to_sheet(guestListSheetRows(ev.guests, { sideLabel, mealLabel }));
    ws["!cols"] = GUEST_SHEET_COLS;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "רשימת אורחים");
    XLSX.writeFile(wb, `אורחים-${(ev.name || "אירוע").replace(/[^\p{L}\p{N} -]/gu, "")}.xlsx`);
  };

  // Open WhatsApp to a specific guest with a personal invite.
  //
  // The link is the INVITATION stage's own (checklist 88): the event site when
  // it is published, else the page that stage falls back to — never a raw
  // /invite/ link to a site that says "not published yet", which is what this
  // button sent until the 29.9 review. Guarded like every other send (a guest-
  // mode link resolves to nothing), and recorded as sent on the messages
  // screen, so the sequence there knows this family already got it.
  // Was a second copy of the phone normaliser with its own divergences (no
  // minimum length, so "050" produced wa.me/97250) and a raw `ל${ev.name}`,
  // which reads "להחתונה של דנה" — in Hebrew the attached ל absorbs the
  // definite article. renderTemplate + whatsappLink already handle both, and
  // they are the versions that have tests.
  const waGuest = (guest) => guard("ההזמנה לאורח", () => {
    const link = linkForStage("invitation", ev, window.location.origin)?.url || "";
    const msg = renderTemplate(
      "היי {{שם}}! 💛\nאתם מוזמנים ל{{אירוע}}.\nכל הפרטים ואישור הגעה כאן:\n{{קישור}}",
      { event: ev, guest, link }
    ) + messageSignature();
    const url = whatsappLink(guest.phone, msg);
    window.open(url || ("https://wa.me/?text=" + encodeURIComponent(msg)), "_blank", "noopener");
    patchEvent(e => ({
      ...e,
      messagesSent: {
        ...(e.messagesSent || {}),
        invitation: { ...((e.messagesSent || {}).invitation || {}), [guest.id]: Date.now() },
      },
    }));
  });

  const visible = ev.guests.filter(g => {
    if (filter.side !== "all" && g.side !== filter.side) return false;
    if (filter.group !== "all" && g.group !== filter.group) return false;
    if (filter.rsvp !== "all" && (g.rsvp || "pending") !== filter.rsvp) return false;
    if (filter.search && !g.name.includes(filter.search)) return false;
    return true;
  });

  const bulkSetRsvp = async (rsvpValue) => {
    const ids = new Set(visible.map(g => g.id));
    // One tap used to overwrite every filtered guest's answer — a confirmed
    // family of 8 became "declined", silently left the meal and seat counts,
    // and stayed seated (29.9 review). Say how many, and how many answers
    // that differ will be replaced.
    const label0 = RSVP_OPTIONS.find(o => o.value === rsvpValue)?.label || rsvpValue;
    const changing = visible.filter(g => (g.rsvp || "pending") !== rsvpValue && (g.rsvp || "pending") !== "pending").length;
    const ok = await confirm(
      `לסמן ${ids.size} אורחים כ"${label0}"?` +
      (changing ? `\n\n${changing} מהם כבר ענו אחרת — התשובה שלהם תוחלף.` : ""),
      { confirmLabel: "סמנו", danger: changing > 0 },
    );
    if (!ok) return;
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
  // MEALS, not rows: a row is a party, and a vegetarian family of four is four
  // vegetarian meals. And a guest who declined eats nothing. The chips counted
  // rows including declined ones, which is not a number a kitchen can use
  // (107, 28.9).
  const coming     = ev.guests.filter(g => g.rsvp !== "declined");
  const comingSeats = coming.reduce((s, g) => s + Math.max(1, g.count || 1), 0);
  const mealCounts = MEAL_OPTIONS.reduce((acc, o) => {
    const n = coming.filter(g => (g.meal || MEAL_DEFAULT) === o.value)
                    .reduce((s, g) => s + Math.max(1, g.count || 1), 0);
    if (n > 0) acc.push({ ...o, n });
    return acc;
  }, []).filter(o => o.value !== MEAL_DEFAULT || o.n < comingSeats);
  // The meal chips count everyone who has not declined — including those who
  // have not answered yet, while the RSVP screen's forecast counts confirmed
  // guests only. Two honest numbers for two questions; this one now says what
  // it includes (ב3, owner 2.10).
  const unansweredSeats = coming.filter(g => g.rsvp !== "confirmed")
                                .reduce((s, g) => s + Math.max(1, g.count || 1), 0);
  const tableById  = useMemo(() => new Map(ev.tables.map(t => [t.id, t])), [ev.tables]);
  const tableOf    = id => { const tid = ev.seating[id]; return tid ? tableById.get(tid) || null : null; };

  // The row callbacks must keep their identity across renders, or every
  // memoised GuestRow re-renders anyway. They call through a ref to the
  // current render's handlers, refreshed after each commit — a click only
  // ever happens after one.
  const rowActions = useRef(null);
  useLayoutEffect(() => {
    rowActions.current = {
      wa: waGuest,
      del: delGuest,
      edit: (g) => {
        // Every editable field is loaded from the row, companion
        // names included and padded to the seat count — a field
        // the form renders but does not load is a field the host
        // is being invited to blank out by accident.
        setForm(guestToForm(g, defaultGroup));
        setEditId(g.id);
        // A previous attempt's error (and its aria-invalid) stayed on the
        // field with this guest's name in it (review 6.10). Same reset as
        // cancelEdit.
        setErrors({});
        setCountText(null);
        window.scrollTo(0, 0);
      },
    };
  });
  const onRowWa     = useCallback((g) => rowActions.current.wa(g), []);
  const onRowEdit   = useCallback((g) => rowActions.current.edit(g), []);
  const onRowDelete = useCallback((id, name) => rowActions.current.del(id, name), []);
  const isFiltered = filter.side !== "all" || filter.group !== "all" || filter.rsvp !== "all" || filter.search;

  return (
    <div className={base.page}>
      {dialog}
      {gate}
      <PageHeader
        title="אורחים"
        mark="guests"
        /* What this screen IS, in one line — because the owner's hosts kept
           trying to answer questions here that only the guest can answer. */
        sub="רשימת המוזמנים: מי הוזמן, מאיזה צד, וכמה מקומות לשמור לו. מי באמת הגיע נרשם ביום האירוע, בעמדת הכניסה."
        aside={
          /* Four numbers, one of them leading. The sides and the meal
             breakdown moved to the quiet strip below the header: eleven equal
             boxes in five ink colours gave the eye nowhere to land. */
          <div className={base.pills} data-tour="guests.counts" data-tour-fit>
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
              <span className={base.statChipN}>{m.n}</span> {m.value === "none" ? "בלי מנה" : m.n === 1 ? `מנה ${m.label}` : `מנות ${m.label}`}
            </span>
          ))}
          {mealCounts.length > 0 && unansweredSeats > 0 && (
            <span className={base.statChip}>
              {unansweredSeats === 1 ? "כולל מקום אחד שעוד לא ענה" : `כולל ${unansweredSeats} מקומות שעוד לא ענו`}
            </span>
          )}
        </div>
      )}

      <div className={base.stepGuide}>
        {/* From the model — see the note in TableBuilderScreen. */}
        <span className={base.stepBadge}>
          {"שלב " + step.num + " מתוך " + BUILD_STEP_COUNT + " — " + step.label}
        </span>
        <span className={base.stepText}>בחרו איך להכניס את המוזמנים, ואחר כך ממשיכים לשולחנות. הכל נשמר לבד.</span>
      </div>

      {/* ── Guest limit upgrade tip ── */}
      {atCap && (
        <p className={styles.upgradeTip}>
          <Icon name="lock" /> הגעתם למגבלת {capLabel} בתוכנית הנוכחית —{" "}
          <a href="/account" className={styles.upgradeTipLink}>שדרגו את התוכנית</a>{" "}
          להוספת אורחים נוספים.
        </p>
      )}

      {/* ── The three ways in — FIRST, because they are what the page is for ──
          They used to sit under the manual form: a host typed forty names by
          hand and only then met the paste box and the shared link. Each option
          is titled by what HAPPENS, not by what it is called. */}
      {!editId && (
        <div className={styles.ways} data-tour="guests.ways">
          <SectionLabel>איך להכניס את המוזמנים לרשימה</SectionLabel>
          <div className={styles.waysGrid}>
            <button
              type="button"
              className={[styles.way, addWay === "manual" ? styles.wayOn : ""].filter(Boolean).join(" ")}
              aria-pressed={addWay === "manual"}
              onClick={() => { setAddWay("manual"); setTimeout(() => nameRef.current && nameRef.current.focus(), 50); }}
            >
              <span className={styles.wayIcon}><Icon name="edit" size={18} /></span>
              <span className={styles.wayTitle}>פשוט להקליד בעצמכם</span>
            </button>

            <button
              type="button"
              className={[styles.way, addWay === "list" ? styles.wayOn : ""].filter(Boolean).join(" ")}
              aria-pressed={addWay === "list"}
              onClick={() => setAddWay("list")}
            >
              <span className={styles.wayIcon}><Icon name="clipboard" size={18} /></span>
              <span className={styles.wayTitle}>להדביק רשימה שכבר יש לכם</span>
            </button>

            <button
              type="button"
              className={styles.way}
              onClick={() => go("collab")}
            >
              <span className={styles.wayIcon}><Icon name="link" size={18} /></span>
              <span className={styles.wayTitle}>לשלוח קישור {collabWhoTo} — והם ממלאים</span>
            </button>
          </div>
          {/* The explanations fold away (136 stage D: "ההסברים מתקפלים"). As
              three open cards they put the add form ~1,050px down at 390 and
              the name field at ~1,380. The buttons say what each way IS; how it
              works is one tap away. */}
          <details className={styles.waysHelp}>
            <summary>מה ההבדל בין שלוש הדרכים?</summary>
            <dl>
              <dt>להקליד</dt>
              <dd>אתם ממלאים שם, טלפון וכמה מקומות לשמור. הצד והקבוצה נשארים כפי שבחרתם, כך שאפשר להזין משפחה שלמה ברצף.</dd>
              <dt>להדביק רשימה</dt>
              <dd>שמות בהודעת וואטסאפ, בפתק או בגיליון — מדביקים הכל בבת אחת, שם אחד בכל שורה. טלפון שנמצא באותה שורה נקלט לבד. כולם נכנסים לאותו צד ולאותה קבוצה.</dd>
              <dt>לשלוח קישור</dt>
              <dd>שולחים קישור אחד בוואטסאפ. כל מי שפותח אותו מוסיף את המוזמנים שלו לאותה טבלה, בלי הרשמה ובלי סיסמה. כל שורה שהושלמה מופיעה כאן מיד.</dd>
            </dl>
          </details>
        </div>
      )}

      <div className={[base.card, editId ? base.cardEdit : ""].filter(Boolean).join(" ")} data-tour="guests.form">
        <SectionLabel>
          {editId
            ? ("עריכת אורח — " + (ev.guests.find(g => g.id === editId)?.name ?? ""))
            : showList ? "הדביקו את הרשימה" : "הוספת אורח"}
        </SectionLabel>

        {showList && !editId ? (
          <div className={styles.listAddPanel}>
            {/* One example, not a format spec. A host with a list already in
                WhatsApp will not rewrite it to match our rules — so the parser
                stays forgiving and this shows the shape that gets the most out
                of it, rather than demanding it. The example is wrapped in <bdi>
                because it mixes Hebrew names with a Latin-digit phone number,
                and the neutral parentheses between them would otherwise resolve
                against the surrounding paragraph (bug class 7). */}
            <p className={styles.listAddHint}>
              שם אחד בכל שורה. הצורה שנקלטת הכי טוב:{" "}
              <bdi className={styles.listAddSample}>דניאל ישראל (אודליה, מיכאל, אריאל) 0533307300</bdi>{" "}
              — השם הראשי, מי שמצטרף אליו בסוגריים, והטלפון. תקבלו שורה אחת עם ארבעה
              מקומות וכל השמות. גם רשימה פשוטה של שמות בלבד עובדת, וגם "+1"; מה שלא
              יזוהה תוכלו לתקן במסך האישור לפני שמשהו נכנס. בחרו למטה לאיזה צד ולאיזו
              קבוצה כולם שייכים; אפשר לשנות לכל אחד בנפרד אחר כך.
            </p>
            {reviewRows ? (
              <ImportReview
                rows={reviewRows}
                existingGuests={ev.guests}
                onChange={setReviewRows}
                onConfirm={addFromList}
                onCancel={() => setReviewRows(null)}
                disabled={atCap}
              />
            ) : (
            <>
            <textarea
              className={[base.input, styles.listAddTextarea].join(" ")}
              value={listText}
              onChange={e => setListText(e.target.value)}
              placeholder={"דניאל ישראל (אודליה, מיכאל, אריאל) 0533307300\nשרה כהן, 050-1234567\nדוד לוי\nעמיר סגמן+1 (יובל סגמן)\n..."}
              rows={6}
              autoFocus
              aria-label="הדביקו כאן את רשימת השמות"
            />
            <div className={styles.listAddRow}>
              <div className={base.seg} role="group" aria-label="הצד שכל השמות ברשימה יקבלו">
                {["bride", "groom"].map(s => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={listSide === s}
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
                className={[base.btnPrimary, base.btnWrap].join(" ")}
                onClick={reviewFromList}
                disabled={parsedList.length === 0}
              >
                בדקו {parsedList.length} אורחים לפני ההוספה
                {parsedSeats > parsedList.length ? ` · ${parsedSeats} מקומות` : ""}
                {parsedWithPhone > 0 ? ` · ${parsedWithPhone} עם טלפון` : ""}
              </button>
              <button className={base.btnSecondary} onClick={() => setAddWay("manual")}>ביטול</button>
            </div>
            </>
            )}
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
            <div className={base.seg} role="group" aria-label="מי הזמין אותם">
              {["bride", "groom"].map(s => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={form.side === s}
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
                  ref={groupInputRef}
                  className={[base.input, errors.group ? base.inputError : ""].filter(Boolean).join(" ")}
                  value={customGroupInput}
                  placeholder="שם הקבוצה החדשה..."
                  maxLength={GROUP_NAME_MAX}
                  autoFocus
                  aria-invalid={errors.group ? true : undefined}
                  aria-describedby={errors.group ? "guest-err-group" : undefined}
                  onChange={e => { setCustomGroupInput(e.target.value); setErrors(x => (x.group ? { ...x, group: null } : x)); }}
                  onKeyDown={e => { if (e.key === "Enter") saveGuest(); }}
                />
                {errors.group && <p id="guest-err-group" role="alert" className={base.fieldError}>{errors.group}</p>}
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
              className={[base.input, errors.name ? base.inputError : ""].filter(Boolean).join(" ")}
              value={form.name}
              placeholder="שם ושם משפחה"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "guest-err-name" : undefined}
              onChange={e => setF("name", e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveGuest(); }}
            />
            {errors.name && <p id="guest-err-name" role="alert" className={base.fieldError}>{errors.name}</p>}
          </Field>
          <Field label="טלפון" hint="לשליחת ההזמנה ואישור ההגעה בוואטסאפ">
            {/* As the RSVP form asks for it: a phone keyboard, written LTR. */}
            <input className={base.input} value={form.phone} placeholder="050-0000000"
              type="tel" inputMode="tel" dir="ltr" autoComplete="off"
              onChange={e => setF("phone", e.target.value)} />
          </Field>
          <Field label="כמה כיסאות לשמור" hint="האורח עצמו + כל מי שמגיע איתו">
            <input className={base.input} type="number" min="1" max="50"
              value={countText ?? (form.count || 1)}
              onChange={e => {
                const t = e.target.value;
                setCountText(t);
                const n = parseInt(t, 10);
                if (n >= 1) setF("count", Math.min(50, n));
              }}
              onBlur={() => setCountText(null)} />
          </Field>
        </div>

        {companionSlots(form.count) > 0 && (
          <Field
            /* The owner's wording: the field has to say WHO these people are.
               "שמות המלווים" told a first-time host nothing. */
            /* Hebrew does not take a numeral in front of a singular this way:
               "מי 1 האנשים" is a plural sentence with the number one in it. The
               seat <select> three lines down already gets this right. */
            label={companionSlots(form.count) === 1
              ? `מי האדם שמצטרף ${form.name.trim() ? "ל" + form.name.trim() : "לרשומה הזו"}?`
              : `מי ${companionSlots(form.count)} האנשים שמצטרפים ${form.name.trim() ? "ל" + form.name.trim() : "לרשומה הזו"}?`}
            /* No longer "אפשר לדלג": a chair with no name cannot be seated on
               purpose and cannot be checked in as a person, so the hint now
               says what to type when the host does not know the name. */
            hint={`${COMPANION_NAME_HINT}. שם על כל כיסא הוא מה שמאפשר לשבת אותם נכון, ולדיילת בכניסה לזהות אותם.`}
            required
          >
            {/* One child for Field, always: it wraps several children in a
                group, so the error line appearing as a second child remounted
                the inputs and took the focus out of the empty seat. */}
            <div>
            <div className={styles.companionsGrid}>
              {companionsForCount(form.companions, form.count).map((val, i) => (
                <input
                  key={i}
                  ref={el => { companionRefs.current[i] = el; }}
                  className={[base.input, errors.companions && !String(val || "").trim() ? base.inputError : ""].filter(Boolean).join(" ")}
                  value={val}
                  placeholder={`שם ${i + 1} — או ״בעל״ / ״חבר״`}
                  aria-label={`שם המצטרף ${i + 1}`}
                  aria-invalid={errors.companions && !String(val || "").trim() ? true : undefined}
                  aria-describedby={errors.companions ? "guest-err-companions" : undefined}
                  /* One name at a time: setCompanionAt keeps every other
                     position exactly as it was. */
                  onChange={e => setF("companions", setCompanionAt(form.companions, i, e.target.value))}
                />
              ))}
            </div>
            {errors.companions && <p id="guest-err-companions" role="alert" className={base.fieldError}>{errors.companions}</p>}
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
              ? `הגעתם למגבלת ${capLabel} — שדרגו את התוכנית`
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
        <div className={base.filterBar} data-tour="guests.filter">
          <span className={styles.filterLabel}>סינון:</span>
          <input
            className={base.input}
            style={{ flex: 1, minWidth: 120 }}
            value={filter.search}
            aria-label="חיפוש אורח לפי שם"
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
        <div className={base.gList} data-tour="guests.list">
          {visible.map(g => (
            <GuestRow
              key={g.id}
              g={g}
              table={tableOf(g.id)}
              isEditing={editId === g.id}
              sideText={sideLabel(g.side)}
              mealText={g.meal && g.meal !== MEAL_DEFAULT ? mealLabel(g.meal) : ""}
              rsvpText={rsvpLabel(g.rsvp)}
              onWa={onRowWa}
              onEdit={onRowEdit}
              onDelete={onRowDelete}
            />
          ))}
        </div>
      )}

      {ev.guests.length === 0 && (
        <EmptyState mark="guests" title="כל אירוע מתחיל ברשימה"
          text={`כל מי שאתם רוצים לראות באירוע. בחרו למעלה איך להתחיל: להקליד שורה-שורה, להדביק רשימה שכבר יש לכם, או לשלוח קישור ${collabWhoTo} שימלאו במקומכם.`} />
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
