import { memo, useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { whatsappLink } from "../../data/messageSequence.js";
import { guestSeatNames } from "../../utils/eventHelpers.js";
import CapBar from "../ui/CapBar.jsx";
import Icon from "../ui/Icon.jsx";
import SideDot from "../ui/SideDot.jsx";
import TableGlyph from "../ui/TableGlyph.jsx";
import TypeTag from "../ui/TypeTag.jsx";
import DraggableGuestRow from "./DraggableGuestRow.jsx";
import base from "../../styles/screenBase.module.css";
// See the note in DraggableGuestRow.jsx — the card's classes stay in the
// seating screen's module because the drag-state selectors are written there.
import styles from "../../screens/SeatingScreen.module.css";

const waUrl = (phone) => whatsappLink(phone, "");

/* Placeholder geometry for an expanded body that has not been rendered yet.
   These are MEASURED heights of the real rows (see qa/seatingPerf.mjs), not
   design values — the placeholder exists so the page is the right length while
   its content is still off-screen, and a token would say nothing about that. */
const H_ROW        = 46;  // .tGuestRow, single line
const H_SEATNAMES  = 20;  // the companions line a multi-seat row adds
const H_ACTIONS    = 28;  // .tGuestListActions
const H_EMPTY      = 34;  // .emptyInline
const H_ADD        = 50;  // the "add a guest to this table" row
const H_PADDING    = 16;  // .tGuestList padding

function estimateBodyHeight(guests, canAdd) {
  let h = H_PADDING + (guests.length > 0 ? H_ACTIONS : H_EMPTY);
  for (const g of guests) h += H_ROW + ((g.count || 1) > 1 ? H_SEATNAMES : 0);
  return h + (canAdd ? H_ADD : 0);
}

/**
 * One table card on the seating screen.
 *
 * Two things this component exists for:
 *
 * 1. **memo.** Expansion is per-table now, so a click on one card must not cost
 *    a re-render of the other 39. Every prop is either a primitive or a value
 *    the screen memoises, so the untouched cards bail out of rendering.
 *
 * 2. **The body is only built when it is near the viewport.** Measured at 400
 *    guests / 40 tables, opening every card built 24,900 DOM nodes in one go
 *    and took 2.4 s to paint. An expanded card that is 3,000px down the page
 *    renders a placeholder of its computed height instead, and swaps in the
 *    real rows when the scroll gets close. The swap is ONE-WAY: once a body has
 *    been built it stays, so scrolling back up never re-runs the work and never
 *    moves content the host is looking at.
 */
function TableCard({
  table, guests, seats, expanded, locked, hasViolation, runKey,
  tables, unassigned, seatsByTable, lockedGuests,
  activeId, draggedSeats,
  sideLabel,
  onToggle, onRename, onClearTable, onToggleTableLock, onToggleGuestLock, onAssign,
}) {
  const { setNodeRef, isOver: isDragOver } = useDroppable({ id: "table-" + table.id });

  const [draft, setDraft] = useState(null);        // null = not renaming
  const isRenaming = draft !== null;

  const commitRename = () => {
    if (draft === null) return;
    if (onRename(table.id, draft)) setDraft(null);
  };

  const isCapOver    = seats > table.capacity;
  const pct          = table.capacity > 0 ? seats / table.capacity : 0;
  const staticBorder = isCapOver ? "var(--red)" : hasViolation ? "var(--warn)" : "var(--border)";
  const isDragSame    = !!activeId && guests.some(g => g.id === activeId);
  const wouldOverflow = !!activeId && !isDragSame && (seats + draggedSeats > table.capacity);
  const canAddGuest   = unassigned.length > 0 && seats < table.capacity;

  // ── Deferred body ───────────────────────────────────────────────────────
  // Initial value covers a runtime without IntersectionObserver: there the body
  // simply renders, rather than never appearing.
  const [bodyBuilt, setBodyBuilt] = useState(() => typeof IntersectionObserver !== "function");
  const placeholderRef = useRef(null);

  useEffect(() => {
    if (!expanded || bodyBuilt) return;
    const el = placeholderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some(e => e.isIntersecting)) setBodyBuilt(true); },
      // A screen's worth of lead time, so the rows exist before they are looked at.
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [expanded, bodyBuilt]);

  const stop = (e) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      className={[
        styles.tCard,
        activeId && !isDragSame && !wouldOverflow && !isDragOver ? styles.tCardDragReady : "",
        activeId && !isDragSame && wouldOverflow  && !isDragOver ? styles.tCardDragBlocked : "",
        isDragOver && !wouldOverflow ? styles.tCardDropOver : "",
        isDragOver && wouldOverflow  ? styles.tCardDropBlocked : "",
      ].filter(Boolean).join(" ")}
      style={{
        borderColor: activeId ? undefined : staticBorder,
        background:  activeId ? undefined : (isCapOver ? "var(--red-bg)" : undefined),
      }}
    >
      <div className={styles.tCardHead}>
        {/* The whole header stays one big expand/collapse target, but the name
            inside it is now its own control and a button cannot nest a button.
            So the toggle is a sibling stretched under the header content; the
            content is pointer-transparent and only the rename control opts in. */}
        <button
          type="button"
          className={styles.tCardToggle}
          aria-expanded={expanded}
          aria-label={(expanded ? "סגרו את " : "פתחו את ") + table.name}
          onClick={() => onToggle(table.id)}
        />
        <div className={styles.tCardLeft}>
          {/* The table drawn as it is, with a seat per place and the taken ones
              filled — so the card answers "how full is this" before any number
              is read. */}
          <TableGlyph
            key={runKey}
            shape={table.shape}
            capacity={table.capacity}
            taken={seats}
            size={46}
            animate={runKey > 0}
            className={styles.tCardGlyph}
          />
          <div className={styles.tCardMeta}>
            <div className={styles.tCardName}>
              {isRenaming ? (
                <input
                  className={styles.tCardNameInput}
                  value={draft}
                  autoFocus
                  aria-label="שם השולחן"
                  maxLength={40}
                  onPointerDown={stop}
                  onChange={e => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === "Enter")  { e.preventDefault(); commitRename(); }
                    if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.tCardNameBtn}
                  title="לחצו לשינוי שם השולחן"
                  onPointerDown={stop}
                  onClick={(e) => { e.stopPropagation(); setDraft(table.name); }}
                >
                  <span className={styles.tCardNameText}>{table.name}</span>
                  <Icon name="edit" size={13} className={styles.tCardNamePencil} />
                </button>
              )}
              {!isCapOver && seats >= table.capacity && table.capacity > 0 && (
                <span className={styles.tCardStar} title="שולחן מלא">✦</span>
              )}
              {table.type !== "regular" && <TypeTag type={table.type} />}
              {locked                 && <span className={styles.tCardBadgeLock}><Icon name="lock" size={13} /></span>}
              {isCapOver              && <span className={styles.tCardBadgeRed}>חריגה!</span>}
              {hasViolation && !isCapOver && <span className={styles.tCardBadgeWarn}>הפרה</span>}
            </div>
            {guests.length === 0 && (
              <div className={styles.tCardEmpty}>{table.capacity} מקומות פנויים</div>
            )}
            {guests.length > 0 && (
              <div className={styles.tChipRow}>
                {["bride", "groom"].map(side => {
                  const n = guests.filter(g => g.side === side).length;
                  if (!n) return null;
                  return (
                    <span
                      key={side}
                      className={[styles.tChip, side === "bride" ? styles.tChipBride : styles.tChipGroom].join(" ")}
                    >
                      <SideDot side={side} /> {n}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className={styles.tCardRight}>
          <CapBar filled={seats} capacity={table.capacity} isOver={isCapOver} />
          <span
            className={styles.tCardCount}
            style={{
              color: isCapOver ? "var(--red)" : pct >= 0.85 ? "var(--warn)" : seats > 0 ? "var(--text)" : "var(--muted)"
            }}
          >
            {seats}/{table.capacity}
            <span className={styles.tCardCapLabel}> מקומות</span>
          </span>
          {pct >= 0.8 && pct < 1 && !isCapOver && (
            <span className={styles.tCardNearCap}>
              {table.capacity - seats} נותרו
            </span>
          )}
          <span className={styles.tCardChevron}><Icon name={expanded ? "chevronUp" : "chevronDown"} size={13} /></span>
        </div>
      </div>

      {expanded && !bodyBuilt && (
        <div
          ref={placeholderRef}
          className={styles.tGuestListPending}
          style={{ height: estimateBodyHeight(guests, canAddGuest) }}
          aria-hidden="true"
        />
      )}

      {expanded && bodyBuilt && (
        <div className={styles.tGuestList}>
          {guests.length > 0 && (
            <div className={styles.tGuestListActions}>
              <button
                className={styles.tClearTableBtn}
                onPointerDown={stop}
                onClick={e => { e.stopPropagation(); onClearTable(table.id); }}
              >
                <Icon name="close" size={13} /> פנו שולחן
              </button>
              <button
                className={[styles.tTableLockBtn, locked ? styles.tTableLockBtnActive : ""].filter(Boolean).join(" ")}
                onPointerDown={stop}
                onClick={e => { e.stopPropagation(); onToggleTableLock(table.id); }}
                title={locked ? "בטלו נעילת שולחן — יוכל לקבל הצעות מהעוזר החכם" : "נעלו שולחן — לא יוצעו שינויים לשולחן זה"}
              >
                {locked ? <><Icon name="lock" /> שולחן נעול</> : <><Icon name="unlock" /> נעלו שולחן</>}
              </button>
            </div>
          )}
          {guests.length === 0 && (
            <span className={styles.emptyInline}>שולחן ריק — גררו אורח לכאן, או בחרו מהממתינים</span>
          )}
          {guests.map(g => {
            const isLockedGuest = lockedGuests.has(g.id);
            const wa = g.phone ? waUrl(g.phone) : null;
            return (
              <DraggableGuestRow key={g.id} guestId={g.id} className={styles.tGuestRow}>
                <SideDot side={g.side} />
                <div className={base.gInfo} style={{ flex: 1 }}>
                  <span className={base.gName}>
                    {g.name}
                    {isLockedGuest && (
                      <span className={styles.tGuestLockedBadge} title="אורח נעול — לא יוצע להזזה"><Icon name="lock" size={12} /></span>
                    )}
                  </span>
                  <span className={base.gMeta}>
                    {g.group}{(g.count || 1) > 1 ? " · " + g.count + " מקומות" : ""}
                  </span>
                  {(g.count || 1) > 1 && (
                    <span className={styles.seatNames}>
                      {guestSeatNames(g).slice(1).join("  ·  ")}
                    </span>
                  )}
                </div>
                {wa && (
                  <a
                    href={wa}
                    className={styles.tGuestWaBtn}
                    target="_blank"
                    rel="noreferrer"
                    title={"WhatsApp: " + g.phone}
                    onPointerDown={stop}
                  ><Icon name="chat" size={16} /></a>
                )}
                <button
                  className={[styles.tGuestLockBtn, isLockedGuest ? styles.tGuestLockBtnActive : ""].filter(Boolean).join(" ")}
                  onPointerDown={stop}
                  onClick={e => { e.stopPropagation(); onToggleGuestLock(g.id); }}
                  title={isLockedGuest ? "בטלו נעילה — האורח יוכל לקבל הצעות" : "נעלו אורח — לא יוצע להזזה על-ידי העוזר החכם"}
                >
                  <Icon name={isLockedGuest ? "lock" : "unlock"} size={14} />
                </button>
                <button
                  className={styles.tGuestRemoveBtn}
                  onPointerDown={stop}
                  onClick={e => { e.stopPropagation(); onAssign(g.id, null); }}
                  title="החזירו לרשימת הממתינים"
                ><Icon name="undo" size={14} /></button>
                <select
                  className={[base.select, base.selectInline].join(" ")}
                  value={table.id}
                  aria-label={"השולחן של " + g.name}
                  onPointerDown={stop}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "__remove__")   onAssign(g.id, null);
                    else if (val !== table.id)  onAssign(g.id, val);
                  }}
                >
                  <option value={table.id}>{table.name} (כאן)</option>
                  <option value="__remove__">הסירו מהשולחן</option>
                  <optgroup label="העבירו לשולחן אחר">
                    {tables.filter(ot => ot.id !== table.id).map(ot => {
                      const otSeats = seatsByTable.get(ot.id) || 0;
                      const full    = otSeats + (g.count || 1) > ot.capacity;
                      return (
                        <option key={ot.id} value={ot.id} disabled={full}>
                          {ot.name} ({otSeats}/{ot.capacity}){full ? " — מלא" : ""}
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
              </DraggableGuestRow>
            );
          })}

          {canAddGuest && (
            <div className={[styles.tGuestRow, styles.tAddGuestRow].join(" ")}>
              <span className={base.gMeta} style={{ flex: 1, color: "var(--text2)" }}>הוסיפו אורח לשולחן זה:</span>
              <select
                className={[base.select, base.selectInline].join(" ")}
                value=""
                aria-label={"הוסיפו אורח ל" + table.name}
                onChange={e => { if (e.target.value) onAssign(e.target.value, table.id); }}
              >
                <option value="">— בחרו מהממתינים —</option>
                {unassigned.map(g => {
                  const full = seats + (g.count || 1) > table.capacity;
                  return (
                    <option key={g.id} value={g.id} disabled={full}>
                      {g.name} ({sideLabel(g.side)}{(g.count || 1) > 1 ? ` · ${g.count}` : ""}){full ? " — לא נכנס" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(TableCard);
