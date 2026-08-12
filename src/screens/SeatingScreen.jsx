import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef, Fragment } from "react";
import { flushSync } from "react-dom";
import { messageSignature } from "../data/company.js";
import { renderTemplate, whatsappLink } from "../data/messageSequence.js";
import Icon from "../components/ui/Icon.jsx";
import { useNavigate } from "react-router-dom";
import {
  DndContext, DragOverlay,
  useDroppable,
  PointerSensor, TouchSensor,
  useSensor, useSensors,
  pointerWithin, rectIntersection, MeasuringStrategy,
} from "@dnd-kit/core";
import { autoAssign, computeViolations } from "../logic/seating.js";
import { generateSuggestions, computeQualityScore } from "../logic/seatingAnalysis.js";
import { exportToExcel } from "../utils/exportHelpers.js";
import { getSideLabel, getSideLabels, guestCompanionNames, seatingTotals } from "../utils/eventHelpers.js";
import { arrivalTotals } from "../utils/arrival.js";
import { fmtDate } from "../utils/dateFormat.js";
import { buildGuestCardUrl } from "../utils/guestCard.js";
import Banner from "../components/feedback/Banner.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import SideDot from "../components/ui/SideDot.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import DraggableGuestRow from "../components/seating/DraggableGuestRow.jsx";
import SuggestionsPanel from "../components/seating/SuggestionsPanel.jsx";
import TableCard from "../components/seating/TableCard.jsx";
import { tableLabel } from "../components/seating/tableLabel.js";
import { tableCardKeys } from "../components/seating/tableCardKeys.js";
import { buildStep, BUILD_STEP_COUNT } from "../data/eventAreas.js";
import base from "../styles/screenBase.module.css";
import styles from "./SeatingScreen.module.css";

function DroppableWrapper({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return children({ ref: setNodeRef, isOver });
}

const MAX_UNDO = 20;

// One shared empty array, so a table with nobody at it hands the memoised card
// the same reference every render instead of a fresh [] that defeats the memo.
const EMPTY_GUESTS = [];

/**
 * Drop targets here are large table cards and a long waiting list. Prefer
 * whatever is under the pointer; when the pointer sits in a gap between cards,
 * fall back to rectIntersection so a drag whose card clearly overlaps a table
 * still lands.
 *
 * Deliberately NOT closestCenter as the fallback: closestCenter always returns
 * something, so releasing over blank space seated the guest at whichever table
 * happened to be nearest. Dropping on empty space has to keep meaning "never
 * mind" — with a long list, an accidental drag is common and there is no undo
 * prompt at that moment.
 */
const collisionStrategy = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

// Table cards expand/collapse and the waiting list re-flows mid-drag, so
// droppable rects measured once at drag start go stale — re-measure always.
const measuringConfig = { droppable: { strategy: MeasuringStrategy.Always } };

/* These two used to be object literals written inline in the useSensors() call,
   and that quietly cost more than anything else on this screen. dnd-kit's
   useSensor memoises on [sensor, options], so a fresh literal every render
   produced a fresh sensor descriptor, a fresh sensors array, fresh `activators`
   and therefore a NEW InternalContext value. useDraggable and useDroppable both
   read that context — and a context change re-renders a consumer straight
   THROUGH React.memo. Measured: every one of the 40 cards and every mounted
   guest row re-rendered on every click, memo or no memo. Hoisting them out is
   what makes the memo on TableCard real. */
const POINTER_ACTIVATION = { activationConstraint: { distance: 5 } };
const TOUCH_ACTIVATION   = { activationConstraint: { delay: 250, tolerance: 5 } };

export default function SeatingScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  // Which table cards are open. A Set, not a single id: opening one table used
  // to close whichever other table was open, which is exactly what the host
  // complained about after running a real event. Nothing closes a card except
  // the host clicking that card, "סגרו הכל", or leaving the screen.
  const [expandedIds, setExpandedIds]       = useState(() => new Set());
  const [activeId, setActiveId]             = useState(null);
  const [seatingHistory, setSeatingHistory] = useState([]);
  const [printMode, setPrintMode]           = useState("full");
  const [printing,  setPrinting]            = useState(false);
  // Bumped every time the plan is computed. Used as a React key on the table
  // glyphs so they remount and replay their fill — the one moment in this
  // product where something genuinely happens, and until now it just appeared.
  const [runKey, setRunKey]                 = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_ACTIVATION),
    useSensor(TouchSensor,   TOUCH_ACTIVATION),
  );

  const violations = useMemo(() =>
    computeViolations(ev.guests, ev.tables, ev.constraints, ev.seating),
    [ev.guests, ev.tables, ev.constraints, ev.seating]
  );

  const qualityScore = useMemo(() =>
    computeQualityScore(ev.guests, ev.tables, ev.constraints, ev.seating, violations),
    [ev.guests, ev.tables, ev.constraints, ev.seating, violations]
  );

  const suggestions = useMemo(() =>
    generateSuggestions(ev.guests, ev.tables, ev.constraints, ev.seating, qualityScore, {
      lockedGuestIds: ev.lockedGuests || [],
      lockedTableIds: ev.lockedTables || [],
      sideLabels:     getSideLabels(ev),
    }),
    // getSideLabels(ev) reads exactly five fields — sideLabels, type,
    // coupleType, brideName, groomName — and all five are listed. Depending on
    // `ev` itself, as the rule wants, would rerun this whole analysis on every
    // unrelated edit to the event, which on a 400-guest plan is the difference
    // between a responsive screen and a stuttering one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ev.guests, ev.tables, ev.constraints, ev.seating, qualityScore, ev.lockedGuests, ev.lockedTables, ev.type, ev.brideName, ev.groomName, ev.sideLabels, ev.coupleType]
  );

  const lockedGuestsSet = useMemo(() => new Set(ev.lockedGuests || []), [ev.lockedGuests]);
  const lockedTablesSet = useMemo(() => new Set(ev.lockedTables || []), [ev.lockedTables]);

  // These three feed the memoised table cards. Recomputing them into fresh
  // arrays on every render would change every card's props on every keystroke
  // and defeat the memo, so they are memoised on the data they actually read.
  const activeGuests   = useMemo(() => ev.guests.filter(g => g.rsvp !== "declined"), [ev.guests]);
  const declinedGuests = useMemo(() => ev.guests.filter(g => g.rsvp === "declined"), [ev.guests]);
  const unassigned     = useMemo(() => activeGuests.filter(g => !ev.seating[g.id]), [activeGuests, ev.seating]);
  // nAssigned counts every seated row (declined included) — it drives the
  // "recompute / clear" confirmations, which really do act on all of them.
  const nAssigned      = ev.guests.filter(g => ev.seating[g.id]).length;
  // Displayed counters are active-only on BOTH sides, so a declined-but-seated
  // guest can't inflate the numerator into "6/5" records or "19/17" seats.
  const {
    assignedRecords: nActiveAssigned,
    totalRecords:    nActiveTotal,
    assignedSeats:   nAssignedSeats,
    totalSeats,
  } = seatingTotals(ev.guests, ev.seating);
  const totalCap       = ev.tables.reduce((s, t) => s + t.capacity, 0);
  const allSeated      = activeGuests.length > 0 && activeGuests.every(g => ev.seating[g.id]);
  const noProblems     = violations.length === 0;
  const noTables       = ev.tables.length === 0;
  const noGuests       = activeGuests.length === 0;

  // getSideLabel(ev, …) reads exactly the five fields listed — same argument as
  // the `suggestions` memo above. Depending on `ev` itself would hand every
  // table card a new callback on every unrelated edit.
  const sideLabel = useCallback(
    s => getSideLabel(ev, s),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ev.type, ev.coupleType, ev.brideName, ev.groomName, ev.sideLabels]
  );

  // One pass over the guests instead of one filter per table. At 40 tables and
  // 400 guests the old `tableGuests(id)` cost 16,000 comparisons per render,
  // and it also handed every card a brand-new array, which is what a memoised
  // card cannot survive. Row order inside a table is unchanged: both walk
  // ev.guests in order.
  const guestsByTable = useMemo(() => {
    const m = new Map(ev.tables.map(t => [t.id, []]));
    for (const g of ev.guests) {
      const tid = ev.seating[g.id];
      if (tid && m.has(tid)) m.get(tid).push(g);
    }
    return m;
  }, [ev.guests, ev.tables, ev.seating]);

  const seatsByTable = useMemo(() => {
    const m = new Map();
    for (const [tid, gs] of guestsByTable) m.set(tid, gs.reduce((s, g) => s + (g.count || 1), 0));
    return m;
  }, [guestsByTable]);

  const tableGuests = tid => guestsByTable.get(tid) || [];

  const buildWhatsAppTableMsg = (g) => {
    const tid   = ev.seating[g.id];
    if (!tid) return null;
    const table = ev.tables.find(t => t.id === tid);
    if (!table) return null;
    // Personal entry card — the QR on it is what the door scanner reads, so the
    // message is also what makes check-in scanning usable at all.
    const cardUrl = buildGuestCardUrl(window.location.origin, ev.tokens?.invite, g, table);
    const cardLine = cardUrl
      ? `\n\nכרטיס הכניסה האישי שלכם (הציגו בכניסה):\n${cardUrl}`
      : "";
    // "ב{{אירוע}}" through renderTemplate: it falls back to "האירוע" for an
    // unnamed event (the raw `ב${ev.name || "האירוע"}` produced "בהאירוע"
    // because normalizeEvent defaults name to "") and it absorbs the definite
    // article, so "החתונה של דנה" reads "בחתונה של דנה" and not "בהחתונה".
    const msg = renderTemplate(
      `שלום {{שם}} 👋\n\nב{{אירוע}} תשבו ב*${tableLabel(table)}*.${cardLine}\n\nנשמח לראותכם! 🎉`,
      { event: ev, guest: g, table }
    ) + messageSignature();
    return whatsappLink(g.phone, msg);
  };

  const whatsappBulkCount = activeGuests.filter(g =>
    ev.seating[g.id] && g.phone && g.phone.replace(/\D/g, "")
  ).length;

  const tableSeats  = tid => seatsByTable.get(tid) || 0;

  const violatedTables = useMemo(() => new Set(
    violations.flatMap(v => [v.tableA, v.tableB]).filter(Boolean)
  ), [violations]);

  const activeGuest = activeId ? ev.guests.find(g => g.id === activeId) : null;

  const pushHistory = () => {
    setSeatingHistory(h => [...h.slice(-(MAX_UNDO - 1)), ev.seating]);
  };

  const runAuto = async () => {
    if (noTables) { showToast("יש להגדיר שולחנות תחילה", "err"); return; }
    if (noGuests) { showToast("יש להוסיף אורחים תחילה", "err"); return; }
    if (nAssigned > 0 && !await confirm(
      "לחשב מחדש את ההושבה?\n\n" +
      nAssigned + " שיבוצים קיימים יוחלפו (אורחים נעולים ישמרו במקומם).\n" +
      "ניתן לבטל עד 20 פעולות אחרי ההרצה.",
      { danger: true, confirmLabel: "חשבו מחדש" }
    )) return;
    pushHistory();
    // A locked TABLE has to pin its occupants too, otherwise "recompute" quietly
    // scattered them — the lock only ever reached the suggestions engine.
    const lockedGuestIds = new Set(ev.lockedGuests || []);
    const lockedSeating  = Object.fromEntries(
      Object.entries(ev.seating).filter(
        ([id, tid]) => lockedGuestIds.has(id) || lockedTablesSet.has(tid)
      )
    );
    // A locked table can be holding a guest who has since declined. autoAssign
    // only charges capacity for guests it is handed, so that occupied seat has
    // to be passed in too — otherwise the table silently overbooks.
    const seatedDeclined = declinedGuests.filter(g => lockedSeating[g.id]);
    // The venue sketch, when there is one. A family too big for one table then
    // spills to the table NEXT TO them instead of to whichever table happens to
    // be emptiest — see the `positions` note on autoAssign. Without a sketch
    // this is undefined and nothing about the result changes.
    const newSeating = autoAssign(
      [...activeGuests, ...seatedDeclined], ev.tables, ev.constraints, lockedSeating,
      ev.floorPlan?.tablePositions
    );
    patchEvent(e => Object.assign({}, e, { seating: newSeating }));
    // Count only active rows: the declined passengers above are in newSeating
    // but were never candidates, and counting them reported "all seated" while
    // a real guest was still standing.
    const placed = activeGuests.filter(g => newSeating[g.id]).length;
    const missed = activeGuests.length - placed;
    if (missed > 0)
      showToast("שובצו " + placed + " רשומות. " + missed + " לא נכנסו — הוסיפו מקומות נוספים", "err");
    else
      showToast("כל " + placed + " הרשומות שובצו ✓");
    // Deliberately NOT collapsing the open cards. A recompute is the moment the
    // host most wants to look at what changed, and closing what they opened is
    // the behaviour they asked to have removed.
    setRunKey(k => k + 1);
  };

  const clearAll = async () => {
    if (!await confirm(
      "לנקות את כל ההושבה?\n\n" +
      "כל " + nAssigned + " הרשומות השובצות יחזרו לרשימת הממתינים.\n" +
      "ניתן לשחזר בלחיצה על \"בטלו\" — אך לא לאחר יציאה מהמסך.",
      { danger: true, confirmLabel: "נקו הכל" }
    )) return;
    pushHistory();
    patchEvent(e => Object.assign({}, e, { seating: {} }));
    showToast("ההושבה נוקתה — " + nAssigned + " רשומות ממתינות לשיבוץ");
  };

  const assignGuest = useCallback((guestId, tableId) => {
    setSeatingHistory(h => [...h.slice(-(MAX_UNDO - 1)), ev.seating]);
    patchEvent(e => {
      const s = Object.assign({}, e.seating);
      if (!tableId) delete s[guestId];
      else s[guestId] = tableId;
      return Object.assign({}, e, { seating: s });
    });
  }, [ev.seating, patchEvent]);

  // ── Expansion, one card at a time ─────────────────────────────────────────
  // Keyed on the CARD, not on `table.id`. Two tables carrying one id is data
  // this screen can be handed (a cloud round-trip, an import, a hand-edited
  // store — nothing in the app mints it), and keyed on the id those two cards
  // shared one entry in this Set and opened and closed as one. See
  // tableCardKeys().
  const cardKeys = useMemo(() => tableCardKeys(ev.tables), [ev.tables]);
  const toggleTable = useCallback((cardKey) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });
  }, []);
  const expandAllTables   = () => setExpandedIds(new Set(cardKeys));
  const collapseAllTables = () => setExpandedIds(new Set());
  const nExpanded  = cardKeys.filter(k => expandedIds.has(k)).length;
  const allExpanded  = ev.tables.length > 0 && nExpanded === ev.tables.length;
  const noneExpanded = nExpanded === 0;

  /**
   * Rename a table from this screen. There is no sync to build — the name lives
   * once, in ev.tables[].name, and the tables screen edits the same field.
   * Returns false when the name was rejected, so the card keeps the input open.
   */
  const renameTable = useCallback((tableId, rawName) => {
    const name    = (rawName || "").trim();
    const current = ev.tables.find(t => t.id === tableId);
    if (!current) return true;
    if (name === (current.name || "")) return true;      // nothing changed
    if (!name) { showToast("שם השולחן לא יכול להיות ריק", "err"); return false; }
    // Two tables answering to one name is not cosmetic: the WhatsApp message,
    // the printed entry card and the violation list all address a table BY NAME.
    if (ev.tables.some(t => t.id !== tableId && (t.name || "").trim() === name)) {
      showToast("כבר קיים שולחן בשם \"" + name + "\" — בחרו שם אחר", "err");
      return false;
    }
    patchEvent(e => Object.assign({}, e, {
      tables: e.tables.map(t => t.id === tableId ? Object.assign({}, t, { name }) : t),
    }));
    showToast("שם השולחן שונה ל\"" + name + "\" ✓");
    return true;
  }, [ev.tables, patchEvent, showToast]);

  const undo = () => {
    if (seatingHistory.length === 0) return;
    const prev = seatingHistory[seatingHistory.length - 1];
    setSeatingHistory(h => h.slice(0, -1));
    patchEvent(e => Object.assign({}, e, { seating: prev }));
    showToast("השינוי בוטל ✓");
  };

  const toggleGuestLock = useCallback((guestId) => {
    patchEvent(e => {
      const locked = new Set(e.lockedGuests || []);
      if (locked.has(guestId)) locked.delete(guestId);
      else locked.add(guestId);
      return Object.assign({}, e, { lockedGuests: [...locked] });
    });
  }, [patchEvent]);


  /* The counters below the "הגיעו" label used to count ROWS on both sides, and
     a row is a GROUP: at a real event with sixty people in the room this panel
     read "0 / 39". Both sides are SEATS now, with the denominator coming from
     seatingTotals() through arrivalTotals(), so this panel and the door screen
     cannot disagree about what "everyone" means. */
  const arrival     = useMemo(() => arrivalTotals(ev.guests, ev.seating), [ev.guests, ev.seating]);
  const totalGifts  = ev.guests.reduce((s, g) => s + (g.giftAmount || 0), 0);

  const toggleTableLock = useCallback((tableId) => {
    patchEvent(e => {
      const locked = new Set(e.lockedTables || []);
      if (locked.has(tableId)) locked.delete(tableId);
      else locked.add(tableId);
      return Object.assign({}, e, { lockedTables: [...locked] });
    });
  }, [patchEvent]);

  const handleApplySuggestion = async (suggestion) => {
    const { applyAction } = suggestion;
    if (!applyAction) return;

    let confirmMsg = "";
    if (applyAction.type === "unassignGuest") {
      confirmMsg = `להחזיר את ${applyAction.guestName} מ${applyAction.tableName} לרשימת הממתינים?`;
    } else if (applyAction.type === "moveGuest") {
      confirmMsg = `להעביר את ${applyAction.guestName} מ${applyAction.fromTableName} ל${applyAction.toTableName}?`;
    } else if (applyAction.type === "swapGuests") {
      confirmMsg = `להחליף בין ${applyAction.guestAName} (${applyAction.tableAName}) ל${applyAction.guestBName} (${applyAction.tableBName})?`;
    } else if (applyAction.type === "seatUnassigned") {
      confirmMsg = `לשבץ אוטומטית את ${applyAction.count} הרשומות שנותרו? השיבוצים הקיימים יישמרו במקומם.`;
    }

    if (!await confirm(confirmMsg)) return;

    pushHistory();

    if (applyAction.type === "unassignGuest") {
      patchEvent(e => {
        const s = Object.assign({}, e.seating);
        delete s[applyAction.guestId];
        return Object.assign({}, e, { seating: s });
      });
      showToast(applyAction.guestName + " הוחזר לרשימת הממתינים ✓");
    } else if (applyAction.type === "moveGuest") {
      patchEvent(e => {
        const s = Object.assign({}, e.seating, { [applyAction.guestId]: applyAction.toTableId });
        return Object.assign({}, e, { seating: s });
      });
      showToast(applyAction.guestName + " הועבר ל" + applyAction.toTableName + " ✓");
    } else if (applyAction.type === "swapGuests") {
      patchEvent(e => {
        const s = Object.assign({}, e.seating, {
          [applyAction.guestAId]: applyAction.tableBId,
          [applyAction.guestBId]: applyAction.tableAId,
        });
        return Object.assign({}, e, { seating: s });
      });
      showToast(applyAction.guestAName + " ו" + applyAction.guestBName + " הוחלפו ✓");
    } else if (applyAction.type === "seatUnassigned") {
      // Fill only the still-unseated active guests, preserving every current
      // placement. autoAssign counts capacity only for guests it receives, so
      // we must also pass any declined-but-seated guest (kept locked via the
      // base) — otherwise their occupied seat is hidden and the table overbooks.
      const seatedDeclined = declinedGuests.filter(g => ev.seating[g.id]);
      const guestsForFill  = [...activeGuests, ...seatedDeclined];
      const newSeating = autoAssign(guestsForFill, ev.tables, ev.constraints, ev.seating,
                                    ev.floorPlan?.tablePositions);
      const added = Object.keys(newSeating).length - Object.keys(ev.seating).length;
      patchEvent(e => Object.assign({}, e, { seating: newSeating }));
      if (added > 0) showToast(added + " רשומות שובצו אוטומטית ✓");
      else showToast("לא נמצא מקום פנוי מתאים — הוסיפו שולחנות או מקומות", "err");
    }
  };

  const handlePrint = (mode) => {
    setPrintMode(mode);
    setPrinting(true);
    // 200ms gives React time to re-render the chosen print layout before the
    // print dialog snapshots the page (60ms was too tight on slow devices).
    setTimeout(() => { window.print(); setPrintMode("full"); setPrinting(false); }, 200);
  };

  // The three print layouts were mounted at ALL times behind display:none —
  // 2,657 of the page's 4,134 DOM nodes at 400 guests — and were therefore
  // rebuilt and reconciled on every render of a screen whose entire job is
  // changing state. Mount them only while printing.
  //
  // beforeprint covers the browser's own Ctrl+P, which never goes through
  // handlePrint(); flushSync is required there because window.print() blocks
  // synchronously right after the event, so a normal setState would commit too
  // late and print an empty page.
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after  = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint",  after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint",  after);
    };
  }, []);

  const clearTable = useCallback((tableId) => {
    const guests = guestsByTable.get(tableId) || [];
    if (guests.length === 0) return;
    setSeatingHistory(h => [...h.slice(-(MAX_UNDO - 1)), ev.seating]);
    patchEvent(e => {
      const s = Object.assign({}, e.seating);
      guests.forEach(g => delete s[g.id]);
      return Object.assign({}, e, { seating: s });
    });
    const t = ev.tables.find(t => t.id === tableId);
    showToast((t?.name || "השולחן") + " פונה — " + guests.length + " רשומות חזרו לממתינים");
  }, [guestsByTable, ev.seating, ev.tables, patchEvent, showToast]);

  /* ── The board must not move under the finger that is dragging ─────────────
     When everyone is seated the "ממתינים לשיבוץ" panel is not on the page: it
     is mounted BY the drag, because it is also the "put this one back" target.
     It mounts ABOVE the table cards, so at the moment the drag activates every
     card below it dropped 116px — measured — while the pointer stayed where it
     was. The card the host was aiming at was no longer under their thumb, and
     releasing there did nothing at all.

     This was always true; it was hidden while a collapsed card was stretched to
     236px by its grid row and could absorb the shift. Cards size to their own
     content now (see .tableCards), so 116px is enough to miss a 73px card.

     Scroll by exactly what was inserted, so nothing visible moves. Nothing to
     compensate at the top of the page — there the panel simply appears, and the
     host can see it happen. */
  const waitingRef    = useRef(null);
  const waitingHeight = useRef(0);
  useLayoutEffect(() => {
    const el = waitingRef.current;
    const h  = el ? el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginBottom || 0) : 0;
    const delta = h - waitingHeight.current;
    waitingHeight.current = h;
    if (!delta || window.scrollY <= 0) return;
    window.scrollBy(0, delta);
  }, [activeId, unassigned.length]);

  const handleDragStart  = ({ active }) => setActiveId(active.id);
  const handleDragCancel = () => setActiveId(null);

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    if (!over) return;
    const guestId = active.id;
    if (over.id === "unassigned") {
      if (!ev.seating[guestId]) return;
      assignGuest(guestId, null);
      return;
    }
    const toTableId = over.id.replace(/^table-/, "");
    if (ev.seating[guestId] === toTableId) return;
    const targetTable = ev.tables.find(t => t.id === toTableId);
    if (targetTable) {
      const occupiedSeats = ev.guests
        .filter(g => ev.seating[g.id] === toTableId)
        .reduce((s, g) => s + (g.count || 1), 0);
      const draggedSeats = ev.guests.find(g => g.id === guestId)?.count || 1;
      if (occupiedSeats + draggedSeats > targetTable.capacity) {
        showToast(targetTable.name + " מלא — אין מקום עבור " + (activeGuest?.name || "האורח"), "err");
        return;
      }
    }
    assignGuest(guestId, toTableId);
  };

  return (
    <>
      {dialog}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionStrategy}
        measuring={measuringConfig}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* screenContent class is used only by @media print to hide the interactive UI */}
        <div className={[base.page, styles.screenContent].join(" ")}>
          <PageHeader
            title="סידור הושבה"
            mark="seating"
            sub="חשבו הושבה אוטומטית ואז ערכו ידנית לפי הצורך."
            aside={
              <div className={base.pills}>
                <StatPill n={nActiveAssigned}     label="שובצו"   primary color={allSeated ? "var(--green)" : undefined} />
                <StatPill n={unassigned.length}   label="ממתינים" color={unassigned.length > 0 ? "var(--warn)" : undefined} />
                {declinedGuests.length > 0 && <StatPill n={declinedGuests.length} label="סירבו" color="var(--muted)" />}
                {arrival.arrivedSeats > 0 && <StatPill n={arrival.arrivedSeats} label="הגיעו" color="var(--green)" />}
                {totalGifts > 0 && <StatPill n={"₪" + totalGifts.toLocaleString("he-IL")} label="מתנות" color="var(--green)" />}
                <StatPill n={violations.length}   label={violations.length === 1 ? "הפרה" : "הפרות"}   color={violations.length > 0 ? "var(--red)" : undefined} />
              </div>
            }
          />

          <div className={base.stepGuide}>
            <span className={base.stepBadge}>
              {`שלב ${buildStep("seating").num} מתוך ${BUILD_STEP_COUNT} — סידור הושבה`}
            </span>
            <span className={base.stepText}>הריצו את הסידור האוטומטי ואז גררו אורחים בין שולחנות לפי הצורך. כל שינוי נשמר מיידית.</span>
          </div>

          {noTables && (
            <Banner variant="warn">
              יש להגדיר שולחנות לפני סידור ההושבה.
              <button className={[base.btnSm, base.btnGhost].join(" ")} style={{ marginInlineEnd: 8 }} onClick={() => go("tables")}>עברו לשולחנות</button>
            </Banner>
          )}
          {noGuests && (
            <Banner variant="warn">
              יש להוסיף אורחים לפני סידור ההושבה.
              <button className={[base.btnSm, base.btnGhost].join(" ")} style={{ marginInlineEnd: 8 }} onClick={() => go("guests")}>עברו לאורחים</button>
            </Banner>
          )}

          <div className={styles.runCard}>
            <div className={styles.runCardInfo}>
              <div className={styles.runCardTitle}>✦ חשבו הושבה אוטומטית</div>
              <div className={styles.runCardSub}>
                {noTables ? `לפני ההרצה — הגדירו שולחנות בשלב ${buildStep("tables").num}.`
                  : noGuests ? `לפני ההרצה — הוסיפו אורחים בשלב ${buildStep("guests").num}.`
                  : "המערכת תשבץ את כל האורחים תוך כיבוד קבוצות, צדדים ואילוצים."}
              </div>
              <div className={styles.runCardStats}>
                {nAssignedSeats} / {totalSeats} מקומות שובצו · {nActiveAssigned}/{activeGuests.length} רשומות פעילות · {totalCap} קיבולת האולם
                {declinedGuests.length > 0 && ` · ${declinedGuests.length} סירבו (לא משובצים)`}
              </div>
            </div>
            <div className={styles.runCardActions}>
              {/* ── Primary: calculate / clear / undo ── */}
              <div className={styles.runActionsMain}>
                <button className={styles.runBtn} onClick={runAuto} disabled={noTables || noGuests}>
                  {/* "חשבו הושבה" reads as a description of the screen, not as
                      something to press. The host asked for the button to say
                      what pressing it does. */}
                  {nAssigned > 0 ? "חשבו מחדש" : "לחצו להושבה אוטומטית"}
                </button>
                {nAssigned > 0 && (
                  <button
                    className={[base.btnSm, base.btnDanger].join(" ")}
                    onClick={clearAll}
                  >
                    נקו הכל
                  </button>
                )}
                <button
                  className={[base.btnSm, base.btnGhost, styles.undoBtn].join(" ")}
                  onClick={undo}
                  disabled={seatingHistory.length === 0}
                  title={seatingHistory.length > 0 ? "בטלו שינוי הושבה אחרון (" + seatingHistory.length + " זמינים)" : "אין שינויים לביטול"}
                >
                  <Icon name="undo" size={14} /> בטלו
                </button>
              </div>

              {/* ── Secondary: print / check-in / export ── */}
              <div className={styles.runActionsSecondary}>
                <div className={styles.runActionsGroup}>
                  <button
                    className={[base.btnSm, base.btnGhost, styles.printBtn].join(" ")}
                    onClick={() => handlePrint("full")}
                    title="הדפיסו סידור הושבה המלא עם פרטי צד וקבוצה"
                  >
                    <Icon name="print" size={15} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />הדפיסו
                  </button>
                  <button
                    className={[base.btnSm, base.btnGhost, styles.printBtn].join(" ")}
                    onClick={() => handlePrint("compact")}
                    title="הדפיסו גרסה קומפקטית לצוות האולם — שמות בלבד"
                  >
                    <Icon name="clipboard" size={15} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />לצוות האולם
                  </button>
                  <button
                    className={[base.btnSm, base.btnGhost, styles.printBtn].join(" ")}
                    onClick={() => handlePrint("cards")}
                    title="הדפיסו כרטיסי שולחן — כרטיס אחד לכל שולחן למיקום על השולחן"
                  >
                    <Icon name="cards" size={15} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />כרטיסי שולחן
                  </button>
                </div>
                {/* Was two buttons — "צ׳ק אין" opening a panel on this screen,
                    and "מסך כניסה" opening another one. One door. */}
                <div className={styles.runActionsGroup}>
                  <button
                    className={[base.btnSm, base.btnGhost].join(" ")}
                    onClick={() => navigate("/events/" + ev.id + "/entrance")}
                    title="פתחו את עמדת הכניסה — לשימוש על טאבלט או טלפון בכניסה לאירוע"
                  >
                    <Icon name="phone" size={15} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />עמדת כניסה
                  </button>
                </div>
                <button
                  className={[base.btnSm, styles.xlsBtn].join(" ")}
                  onClick={() => exportToExcel(ev, sideLabel, violations)}
                  title="ייצוא לקובץ אקסל"
                  disabled={ev.guests.length === 0 && ev.tables.length === 0}
                >
                  <Icon name="chart" size={15} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />ייצוא לאקסל
                </button>
              </div>
            </div>
          </div>

          {allSeated && noProblems && (
            <div className={styles.successCard}>
              <div className={styles.successIconWrap}><Icon name="check" size={22} /></div>
              <div className={styles.successText}>
                <div className={styles.successTitle}>הושבה מלאה וללא הפרות</div>
                <div className={styles.successSub}>
                  כל {activeGuests.length} הרשומות שובצו בהצלחה ל{ev.tables.length} שולחנות.
                  {declinedGuests.length > 0 && ` (${declinedGuests.length} סירבו ולא שובצו)`}
                </div>
              </div>
            </div>
          )}

          {whatsappBulkCount > 0 && nAssigned > 0 && (
            <div className={styles.waNotifyCard}>
              <div className={styles.waNotifyIcon}><Icon name="chat" size={22} /></div>
              <div className={styles.waNotifyText}>
                <div className={styles.waNotifyTitle}>שלחו מספר שולחן בווטסאפ</div>
                <div className={styles.waNotifySub}>
                  {whatsappBulkCount} אורחים משובצים עם מספר טלפון — שלחו להם הודעה אישית עם מספר השולחן.
                </div>
              </div>
              <div className={styles.waNotifyList}>
                {activeGuests
                  .filter(g => ev.seating[g.id] && g.phone && g.phone.replace(/\D/g, ""))
                  .sort((a, b) => {
                    const ta = ev.tables.find(t => t.id === ev.seating[a.id])?.name || "";
                    const tb = ev.tables.find(t => t.id === ev.seating[b.id])?.name || "";
                    return ta.localeCompare(tb, "he") || a.name.localeCompare(b.name, "he");
                  })
                  .slice(0, 5)
                  .map(g => {
                    const url = buildWhatsAppTableMsg(g);
                    const table = ev.tables.find(t => t.id === ev.seating[g.id]);
                    return url ? (
                      <a key={g.id} href={url} target="_blank" rel="noreferrer" className={styles.waNotifyItem}>
                        <SideDot side={g.side} />
                        <span className={styles.waNotifyName}>{g.name}</span>
                        <span className={styles.waNotifyTable}>{tableLabel(table)}</span>
                        <span className={styles.waNotifyArrow}><Icon name="send" size={16} /></span>
                      </a>
                    ) : null;
                  })
                }
                {whatsappBulkCount > 5 && (
                  <div className={styles.waNotifyMore}>ועוד {whatsappBulkCount - 5} אורחים נוספים — ייצאו לאקסל לרשימה מלאה</div>
                )}
              </div>
            </div>
          )}

          {violations.length > 0 && (
            <div className={styles.violCard}>
              <div className={styles.violHeader}>
                <span className={styles.violTitle}>
                  <Icon name="alert" /> {violations.length} {violations.length === 1 ? "הפרה" : "הפרות"} בסידור הנוכחי
                </span>
                <button className={[base.btnSm, base.btnGhost].join(" ")} onClick={runAuto}>חשבו מחדש</button>
              </div>
              <p className={styles.violExplain}>
                האילוצים הבאים לא מתקיימים — ניתן לתקן אוטומטית באמצעות "חשבו מחדש", או להעביר אורחים ידנית.
              </p>
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
                      <Icon name={v.type === "capacity" ? "chair" : v.type === "apart" ? "apart" : "together"} size={16} />
                    </span>
                    <span>{v.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(ev.guests.length > 0 && ev.tables.length > 0) && (
            <SuggestionsPanel
              suggestions={suggestions}
              qualityScore={qualityScore}
              onApply={handleApplySuggestion}
            />
          )}

          {/* The "חיפוש אורח — יום האירוע" card and the "מצב צ׳ק אין" panel
              used to live here. They were the second and third copies of the
              door, and this screen is not the door: arrival is per-person now
              (`arrivedSeats`), and neither panel could express "the aunt is
              here, her four are not" — both wrote the row-level boolean, which
              silently means everyone. עמדת הכניסה does that, plus walk-ins,
              by-table search and companion search, on a dark ground that does
              not blind a greeter in a dark hall. One door, one screen. */}

          {(unassigned.length > 0 || !!activeId) && (
            <DroppableWrapper id="unassigned">
              {({ ref, isOver: isDragOver }) => (
                <div
                  ref={node => { ref(node); waitingRef.current = node; }}
                  className={[
                    styles.unassignedCard,
                    activeId && !isDragOver ? styles.unassignedDropReady : "",
                    isDragOver ? styles.unassignedDropActive : "",
                  ].filter(Boolean).join(" ")}
                >
                  <div className={styles.unassignedHeader}>
                    <span className={styles.unassignedTitle}><Icon name="chair" size={15} /> ממתינים לשיבוץ</span>
                    {unassigned.length > 0 && (
                      <span className={styles.unassignedCount}>{unassigned.length} רשומות</span>
                    )}
                  </div>

                  {unassigned.length === 0 ? (
                    <div className={styles.unassignedEmptyDrop}>
                      גררו לכאן להחזרת האורח לרשימת הממתינים
                    </div>
                  ) : (
                    <>
                      <p className={styles.unassignedHint}>
                        גררו אורח לשולחן, או בחרו שולחן מהרשימה. לסידור חדש — &quot;חשבו מחדש&quot; למעלה.
                      </p>
                      <div className={base.gList}>
                        {[...unassigned]
                          // normalizeEvent does not normalise guest rows, so a
                          // legacy or hand-edited guest can arrive with no `side`
                          // and no `name`. localeCompare on undefined threw and
                          // took the whole seating screen down with it.
                          .sort((a, b) =>
                            (a.side || "") !== (b.side || "")
                              ? (a.side || "").localeCompare(b.side || "")
                              : (a.name || "").localeCompare(b.name || "", "he")
                          )
                          .map((g, i, arr) => {
                            const showSep   = i === 0 || arr[i - 1].side !== g.side;
                            const sideCount = arr.filter(u => u.side === g.side).length;
                            return (
                              <Fragment key={g.id}>
                                {showSep && (
                                  <div className={styles.unassignedSideLabel}>
                                    <SideDot side={g.side} />
                                    <span>{sideLabel(g.side)}</span>
                                    <span className={styles.unassignedSideCount}>{sideCount}</span>
                                  </div>
                                )}
                                <DraggableGuestRow guestId={g.id} className={base.gRow}>
                                  <SideDot side={g.side} />
                                  <div className={base.gInfo}>
                                    <span className={base.gName}>{g.name}</span>
                                    <span className={base.gMeta}>
                                      {g.group}{(g.count || 1) > 1 ? " · " + g.count + " מקומות" : ""}
                                    </span>
                                  </div>
                                  <select
                                    className={[base.select, base.selectInline].join(" ")}
                                    value=""
                                    aria-label={`שבצו את ${g.name} לשולחן`}
                                    onPointerDown={e => e.stopPropagation()}
                                    onChange={e => { if (e.target.value) assignGuest(g.id, e.target.value); }}
                                  >
                                    <option value="">שבצו לשולחן...</option>
                                    {ev.tables.map(t => {
                                      const seats = tableSeats(t.id);
                                      const full  = seats + (g.count || 1) > t.capacity;
                                      return (
                                        <option key={t.id} value={t.id} disabled={full}>
                                          {t.name} ({seats}/{t.capacity}){full ? " — מלא" : ""}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </DraggableGuestRow>
                              </Fragment>
                            );
                          })
                        }
                      </div>
                    </>
                  )}
                </div>
              )}
            </DroppableWrapper>
          )}

          {ev.tables.length > 0 && (
            <div className={styles.tablesToolbar}>
              <span className={styles.tablesToolbarTitle}>השולחנות שלי ({ev.tables.length})</span>
              <div className={styles.tablesToolbarActions}>
                {nExpanded > 0 && (
                  <span className={styles.tablesToolbarCount}>{nExpanded} פתוחים</span>
                )}
                <button
                  className={styles.expandAllBtn}
                  onClick={expandAllTables}
                  disabled={allExpanded}
                  title="פתחו את פירוט האורחים בכל השולחנות — נשאר פתוח עד שתסגרו"
                >
                  <Icon name="chevronDown" size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />
                  פתחו הכל
                </button>
                <button
                  className={[styles.expandAllBtn, styles.collapseAllBtn].join(" ")}
                  onClick={collapseAllTables}
                  disabled={noneExpanded}
                  title="סגרו את פירוט האורחים בכל השולחנות"
                >
                  <Icon name="chevronUp" size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />
                  סגרו הכל
                </button>
              </div>
            </div>
          )}

          {ev.tables.length > 0 && (
            <div className={[styles.tableCards, activeId ? styles.tableCardsDragging : ""].filter(Boolean).join(" ")}>
              {ev.tables.map((t, i) => (
                <TableCard
                  key={cardKeys[i]}
                  cardKey={cardKeys[i]}
                  table={t}
                  guests={guestsByTable.get(t.id) || EMPTY_GUESTS}
                  seats={seatsByTable.get(t.id) || 0}
                  expanded={expandedIds.has(cardKeys[i])}
                  locked={lockedTablesSet.has(t.id)}
                  hasViolation={violatedTables.has(t.name)}
                  runKey={runKey}
                  tables={ev.tables}
                  unassigned={unassigned}
                  seatsByTable={seatsByTable}
                  lockedGuests={lockedGuestsSet}
                  activeId={activeId}
                  draggedSeats={activeGuest?.count || 1}
                  sideLabel={sideLabel}
                  onToggle={toggleTable}
                  onRename={renameTable}
                  onClearTable={clearTable}
                  onToggleTableLock={toggleTableLock}
                  onToggleGuestLock={toggleGuestLock}
                  onAssign={assignGuest}
                />
              ))}
            </div>
          )}
        </div>

        <DragOverlay>
          {activeGuest ? (
            <div className={styles.dragOverlayRow}>
              <SideDot side={activeGuest.side} />
              <span className={styles.dragOverlayName}>{activeGuest.name}</span>
              <span className={styles.dragOverlayMeta}>{sideLabel(activeGuest.side)}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Print-only view ─────────────────────────────────────────────────
          Hidden on screen via display:none. @media print swaps visibility:
          hides .screenContent, shows .printView.
          data-print-mode="full"    → shows detailed 2-col grid
          data-print-mode="compact" → shows 3-col name-only grid for venue staff
      ─────────────────────────────────────────────────────────────────── */}
      {printing && (
      <div className={styles.printView} data-print-mode={printMode}>

        {/* ── Header (both modes) ── */}
        <div className={styles.pvHeader}>
          <div className={styles.pvBrand}>כוכב השולחן</div>
          <h1 className={styles.pvTitle}>{ev.name}</h1>
          {(ev.date || ev.venue) && (
            <p className={styles.pvMeta}>
              {ev.date && <span>{fmtDate(ev.date)}</span>}
              {ev.date && ev.venue && <span> · </span>}
              {ev.venue && <span>{ev.venue}</span>}
            </p>
          )}
          <p className={styles.pvStats}>
            {nActiveAssigned}/{nActiveTotal} רשומות שובצו ({nAssignedSeats}/{totalSeats} מקומות) · {ev.tables.length} שולחנות · {totalCap} קיבולת האולם
          </p>
          <div className={styles.pvModeLabel}>
            {printMode === "compact" ? "גרסת צוות האולם — שמות בלבד" : "סידור הושבה מלא"}
          </div>
        </div>

        <hr className={styles.pvDivider} />

        {/* ── Full mode (detailed 2-col grid) ── */}
        <div className={styles.pvFullOnly}>
          {violations.length > 0 && (
            <div className={styles.pvViolWarn}>
              <Icon name="alert" /> שימו לב: {violations.length} {violations.length === 1 ? "הפרה" : "הפרות"} אילוצים בסידור הנוכחי
            </div>
          )}

          {ev.tables.length > 0 ? (
            <div className={styles.pvGrid}>
              {ev.tables.map(t => {
                const tg      = tableGuests(t.id);
                const tgSeats = tg.reduce((s, g) => s + (g.count || 1), 0);
                const capOver = tgSeats > t.capacity;
                return (
                  <div key={t.id} className={[styles.pvTable, capOver ? styles.pvTableOver : ""].filter(Boolean).join(" ")}>
                    <div className={styles.pvTableHead}>
                      <span className={styles.pvTableName}>{t.name}</span>
                      <span className={styles.pvTableCount}>{tgSeats}/{t.capacity}{capOver ? <> <Icon name="alert" size={12} /></> : ""}</span>
                    </div>
                    <div className={styles.pvTableBody}>
                      {tg.length === 0
                        ? <span className={styles.pvEmpty}>שולחן ריק</span>
                        : tg.map(g => (
                            <div key={g.id} className={styles.pvGuest}>
                              <span className={styles.pvGuestName}>
                                {g.name}
                                {(g.count || 1) > 1 && <span className={styles.pvGuestCount}> ×{g.count}</span>}
                              </span>
                              <span className={styles.pvGuestMeta}>
                                {sideLabel(g.side)}{g.group ? " · " + g.group : ""}
                              </span>
                              {/* Everyone else on the booking, by name. The
                                  printed sheet used to say "טל שוורץ ×2" and
                                  leave the second chair to be guessed. */}
                              {guestCompanionNames(g).length > 0 && (
                                <span className={styles.pvGuestSeats}>
                                  {guestCompanionNames(g).join(" · ")}
                                </span>
                              )}
                            </div>
                          ))
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.pvEmpty} style={{ marginBottom: 12 }}>לא הוגדרו שולחנות</p>
          )}

          {unassigned.length > 0 && (
            <div className={styles.pvUnassigned}>
              <div className={styles.pvUnassignedTitle}><Icon name="chair" size={14} /> ממתינים לשיבוץ ({unassigned.length})</div>
              <div className={styles.pvUnassignedList}>
                {unassigned.map(g => (
                  <span key={g.id} className={styles.pvUnassignedGuest}>
                    {g.name} — {sideLabel(g.side)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Compact mode (3-col name-only grid for venue staff) ── */}
        <div className={styles.pvCompactOnly}>
          <div className={styles.pvCompactGrid}>
            {ev.tables.map(t => {
              const tg    = tableGuests(t.id);
              const seats = tableSeats(t.id);
              return (
                <div key={t.id} className={styles.pvCompactTable}>
                  <div className={styles.pvCompactHead}>
                    <span className={styles.pvCompactName}>{t.name}</span>
                    <span className={styles.pvCompactCount}>{seats}/{t.capacity}</span>
                  </div>
                  <div className={styles.pvCompactBody}>
                    {tg.length === 0
                      ? <span className={styles.pvCompactEmpty}>ריק</span>
                      : tg.map(g => (
                          <div key={g.id} className={styles.pvCompactGuest}>
                            {g.name}{(g.count || 1) > 1 ? " ×" + g.count : ""}
                            {guestCompanionNames(g).length > 0 && (
                              <span className={styles.pvCompactSeats}>
                                {guestCompanionNames(g).join(" · ")}
                              </span>
                            )}
                          </div>
                        ))
                    }
                  </div>
                </div>
              );
            })}
          </div>

          {unassigned.length > 0 && (
            <div className={styles.pvCompactUnassigned}>
              <Icon name="chair" size={12} /> ממתינים לשיבוץ ({unassigned.length}): {unassigned.map(g => g.name).join(" · ")}
            </div>
          )}
        </div>

        {/* ── Cards mode — one card per table, meant to be cut and placed on tables ── */}
        <div className={styles.pvCardsOnly}>
          <div className={styles.pvCardsGrid}>
            {ev.tables.filter(t => tableGuests(t.id).length > 0).map(t => {
              const tg = tableGuests(t.id);
              return (
                <div key={t.id} className={styles.pvCard}>
                  <div className={styles.pvCardBrand}>כוכב השולחן · {ev.name || "האירוע"}</div>
                  <div className={styles.pvCardTableName}>{t.name}</div>
                  <div className={styles.pvCardDivider} />
                  <div className={styles.pvCardGuests}>
                    {tg.map(g => (
                      <div key={g.id} className={styles.pvCardGuest}>
                        {g.name}{(g.count || 1) > 1 ? ` (${g.count})` : ""}
                        {guestCompanionNames(g).length > 0 && (
                          <span className={styles.pvCardGuestSeats}>
                            {guestCompanionNames(g).join(" · ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className={styles.pvCardFooter}>{tg.reduce((s, g) => s + (g.count || 1), 0)} / {t.capacity} מקומות</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.pvFooter}>
          הופק באמצעות כוכב השולחן · {new Date().toLocaleDateString("he-IL")}
        </div>
      </div>
      )}
    </>
  );
}
