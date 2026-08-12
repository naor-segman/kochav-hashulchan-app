import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { tableLabel } from "../components/seating/tableLabel.js";
import { getSideLabel } from "../utils/eventHelpers.js";
import { uid } from "../utils/uid.js";
import {
  seatsOf, arrivedSeatsOf, arrivedCountOf, isFullyArrived, withArrivedSeats,
  setRowArrived, toggleSeat, setArrivedCount, arrivalTotals, searchGuests,
  seatChipLabels, tableAvailability, norm,
} from "../utils/arrival.js";
import { fetchHostessData, markArrivalByToken } from "../utils/publicTokens.js";
import { isScanSupported, parseScanPayload } from "../utils/scanPayload.js";
import QrScanner from "../components/ui/QrScanner.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import Icon from "../components/ui/Icon.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import styles from "./EntranceScreen.module.css";
import { useShareGate } from "../components/share/useShareGate.jsx";

/**
 * עמדת הכניסה — the one screen the door runs on.
 *
 * It replaces three overlapping things that lived in the same space: the
 * owner's CheckInScreen, the read-only hostess link, and the "מסך כניסה"
 * button on the seating screen. The owner's question was the right one — "למה
 * צריך את הצ'ק-אין אם יש מצב כניסה שנותן את אותו מענה ויותר?" — so there is now
 * one screen with one name, and two ways in:
 *
 *   mode="owner"  /events/:eventId/entrance  — the host's own device. Arrival,
 *                 walk-ins, and the switch that opens the door link.
 *   mode="token"  /entrance/:token           — a hired greeter's phone, no
 *                 account. Arrival only, enforced in SQL, not here.
 *
 * Everything below is judged against one situation: ONE HAND, A PHONE, A DARK
 * ROOM, A QUEUE AT THE DOOR. That is why the ground is dark rather than the
 * white the old check-in screen used, why the primary action on every row is a
 * single full-width tap that means "everyone in this row is here", and why
 * partial arrival — the exception — is one level down and never in the way.
 */
// ── One guest row ──────────────────────────────────────────────────────────
//
// Hoisted to module scope ON PURPOSE. Declared inside EntranceScreen this was a
// NEW component type on every render, so React unmounted and remounted the whole
// row subtree each time. That used to be a data bug as well as a slow one: the
// gift <input> lived in this row, and every keystroke destroyed and recreated
// the node, so focus was lost after the FIRST character and a host typing "300"
// banked ₪3. The field has since been removed from this screen — the remount is
// still wrong, on a phone with a queue at the door — so the hoist stays, and
// everything the row uses from the closure arrives as `ui`.
function GuestRow({ g, matchLabel, compact, declined, ui }) {
  const { canWrite, expanded, isToken, lastChecked, markCount, markRow, markSeat, setExpanded, sideLabel, tableOf } = ui;
  const seats   = seatsOf(g);
  const here    = arrivedCountOf(g);
  const full    = here === seats;
  const partial = here > 0 && !full;
  const table   = tableOf(g);
  const open    = expanded === g.id;
  const chips   = seatChipLabels(g);
  const arrived = new Set(arrivedSeatsOf(g));

  return (
    <div className={[
      styles.row,
      full ? styles.rowFull : "",
      partial ? styles.rowPartial : "",
      g.id === lastChecked ? styles.rowLast : "",
    ].filter(Boolean).join(" ")}>

      <div className={styles.rowHead}>
        <div className={styles.rowId}>
          <span className={styles.rowName}>{g.name}</span>
          {matchLabel && matchLabel !== g.name && (
            <span className={styles.rowVia}>
              נמצא/ה דרך <b>{matchLabel}</b>
            </span>
          )}
          {declined && <span className={styles.rowDeclined}>סימנ/ה שלא מגיע/ה</span>}
          {!compact && (
            <span className={styles.rowMeta}>
              {[
                seats > 1 ? `${seats} מקומות` : "מקום אחד",
                !isToken && g.side ? sideLabel(g.side) : "",
                !isToken && g.group ? g.group : "",
              ].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        {table
          ? <span className={styles.rowTable}>{tableLabel(table)}</span>
          : <span className={styles.rowNoTable}>טרם שובץ לשולחן</span>}
      </div>

      {/* The whole point of the screen: one full-width tap = the whole row is
          in. Everything else on this card is smaller than it. */}
      <div className={styles.rowActions}>
        <button
          className={[styles.markBtn, full ? styles.markBtnDone : ""].filter(Boolean).join(" ")}
          onClick={() => markRow(g, !full)}
          disabled={!canWrite}
        >
          {full
            ? <><Icon name="check" size={18} /> {seats > 1 ? `כל ${seats} הגיעו` : "הגיע/ה"}</>
            : (seats > 1 ? `כולם הגיעו · ${seats}` : "הגיע/ה")}
        </button>

        {seats > 1 && (
          <button
            className={[styles.partialBtn, open ? styles.partialBtnOpen : ""].filter(Boolean).join(" ")}
            onClick={() => setExpanded(x => (x === g.id ? null : g.id))}
            aria-expanded={open}
            aria-label="סימון חלקי — מי בדיוק הגיע"
          >
            <span className={styles.partialNum}>{here}/{seats}</span>
            <Icon name={open ? "chevronUp" : "chevronDown"} size={14} />
          </button>
        )}
      </div>

      {/* Partial arrival — the exception. "דודה שלי מסמנת שהיא מגיעה עם עוד 4,
          אבל בפועל הם הגיעו בנפרד." */}
      {open && seats > 1 && (
        <div className={styles.party}>
          <div className={styles.stepper}>
            <button
              className={styles.stepBtn}
              onClick={() => markCount(g, here - 1)}
              disabled={!canWrite || here === 0}
              aria-label="הפחיתו אחד"
            >−</button>
            <span className={styles.stepNum}>{here} מתוך {seats} הגיעו</span>
            <button
              className={styles.stepBtn}
              onClick={() => markCount(g, here + 1)}
              disabled={!canWrite || full}
              aria-label="הוסיפו אחד"
            >+</button>
          </div>
          <div className={styles.chips}>
            {chips.map((label, i) => (
              <button
                key={i}
                className={[styles.chip, arrived.has(i) ? styles.chipOn : ""].filter(Boolean).join(" ")}
                onClick={() => markSeat(g, i)}
                disabled={!canWrite}
                aria-pressed={arrived.has(i)}
              >
                {arrived.has(i) && <Icon name="check" size={13} />}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The gift amount used to be a field on this row. It is gone from THIS
          screen — nobody announces what is in their envelope to the person
          holding the door, so the greeter had a field they could never fill.
          `giftAmount` itself is untouched: the data model, the seating screen's
          מתנות pill and the Excel gift report all still read it. */}
    </div>
  );
}

export default function EntranceScreen({
  mode = "owner",
  events = [],
  patchEventById,
  loading = false,
}) {
  // The door link is a share link like any other: in guest mode the event has
  // no cloud row, so /entrance/<token> resolves to "הקישור אינו תקין" for the
  // greeter it was handed to.
  const { guard, gate } = useShareGate();
  const { eventId, token } = useParams();
  const navigate = useNavigate();
  const isToken  = mode === "token";

  // ── Token mode: the event arrives over the wire ────────────────────────────
  const [remote, setRemote]       = useState(null);
  const [remoteState, setRemoteState] = useState("loading"); // loading|ready|notfound|error
  const [saveError, setSaveError] = useState("");

  // Guests with a write still in flight. A refresh that landed mid-write used to
  // overwrite them with the server's pre-write state: the greeter's correction
  // vanished from the screen for up to 25 seconds and — worse — the next tap read
  // that stale copy and wrote it back, silently undoing the correction in the
  // database. Measured: untick יעל, poll lands, untick איתי, and יעל is present
  // again on the server.
  const inFlight = useRef(new Set());

  const loadRemote = useCallback(async () => {
    try {
      const data = await fetchHostessData(token);
      if (!data) { setRemoteState("notfound"); return null; }
      setRemote(prev => {
        if (!prev || inFlight.current.size === 0) return data;
        // Keep OUR copy of a row we are still writing; take the server's for
        // every other row, which is the whole point of the refresh.
        const mine = new Map(prev.guests.map(g => [g.id, g]));
        return {
          ...data,
          guests: data.guests.map(g =>
            inFlight.current.has(g.id) ? (mine.get(g.id) ?? g) : g),
        };
      });
      setRemoteState("ready");
      return data;
    } catch {
      setRemoteState("error");
      return null;
    }
  }, [token]);

  useEffect(() => {
    if (!isToken) return undefined;
    let alive = true;
    (async () => { if (alive) await loadRemote(); })();
    // Two greeters can work the same door. A slow refresh is enough to stop
    // them double-marking each other's guests; anything faster burns battery
    // on a phone that has to last the whole evening.
    const iv = setInterval(() => { if (alive) loadRemote(); }, 25000);
    return () => { alive = false; clearInterval(iv); };
  }, [isToken, loadRemote]);

  const localEvent = isToken ? null : events.find(e => e.id === eventId);

  useEffect(() => {
    if (isToken) return;
    // "/app", not "/". Every other event route sends an unknown id to the
    // dashboard; this one dropped the host onto the public sales page.
    if (!loading && !localEvent) navigate("/app", { replace: true });
  }, [isToken, loading, localEvent, navigate]);

  // ── One shape for both modes ───────────────────────────────────────────────
  const ev = isToken
    ? (remote && {
        id: remote.cloudId,
        name: remote.name,
        guests: remote.guests,
        tables: remote.tables,
        seating: remote.seating,
      })
    : localEvent;

  const canWrite  = isToken ? !!remote?.writesOpen : true;
  const canManage = !isToken;   // walk-ins, by-table browse, the door-link switch

  // ── UI state ───────────────────────────────────────────────────────────────
  const [search, setSearch]           = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [viewMode, setViewMode]       = useState("name");   // "name" | "table"
  const [expanded, setExpanded]       = useState(null);     // guestId with the party panel open
  const [lastChecked, setLastChecked] = useState(null);
  const [walkInOpen, setWalkInOpen]   = useState(false);
  const [walkInName, setWalkInName]   = useState("");
  const [walkInCount, setWalkInCount] = useState(1);
  const [walkInSide, setWalkInSide]   = useState("bride");
  const [walkInTable, setWalkInTable] = useState("");
  const [scanning, setScanning]       = useState(false);
  const [scanMsg, setScanMsg]         = useState("");
  const [linkOpen, setLinkOpen]       = useState(false);
  const searchRef = useRef(null);

  // Only the by-name tab. Focusing on the by-table tab raised the phone keyboard
  // over the very list the greeter switched tabs in order to browse.
  useEffect(() => { if (viewMode === "name") searchRef.current?.focus(); }, [viewMode]);

  // ── The single write path ──────────────────────────────────────────────────
  //
  // Every arrival edit in this file goes through here, in both modes, so the
  // local and the token path can never drift on what a mark means.
  const applyArrival = useCallback((guestId, transform) => {
    if (!canWrite) return;
    if (isToken) {
      let nextSeats = null;
      setRemote(prev => {
        if (!prev) return prev;
        const guests = prev.guests.map(g => {
          if (g.id !== guestId) return g;
          const next = transform(g);
          nextSeats = arrivedSeatsOf(next);
          return next;
        });
        return { ...prev, guests };
      });
      // Optimistic locally, authoritative in Postgres. A failure has to be
      // visible: a greeter who thinks a family is checked in when the host's
      // list says otherwise is worse than no check-in at all.
      inFlight.current.add(guestId);
      Promise.resolve().then(() =>
        markArrivalByToken(token, guestId, nextSeats || []),
      ).then(() => { inFlight.current.delete(guestId); setSaveError(""); })
       .catch(() => {
         inFlight.current.delete(guestId);
         setSaveError("השמירה נכשלה — בדקו חיבור ונסו שוב");
         loadRemote();
       });
    } else {
      patchEventById(eventId, e => ({
        ...e,
        guests: e.guests.map(g => (g.id === guestId ? transform(g) : g)),
      }));
    }
  }, [canWrite, isToken, token, eventId, patchEventById, loadRemote]);

  const markRow = useCallback((g, on) => {
    applyArrival(g.id, row => setRowArrived(row, on));
    if (on) setLastChecked(g.id);
  }, [applyArrival]);

  const markSeat = useCallback((g, seat) => {
    applyArrival(g.id, row => toggleSeat(row, seat));
    setLastChecked(g.id);
  }, [applyArrival]);

  const markCount = useCallback((g, n) => {
    applyArrival(g.id, row => setArrivedCount(row, n));
    if (n > 0) setLastChecked(g.id);
  }, [applyArrival]);

  const markTable = useCallback((tableId, on) => {
    if (!canWrite) return;
    if (isToken) {
      // `rsvp !== "declined"` on this side too. Without it the same button wrote
      // different data depending on who tapped it, and an arrival on a decliner
      // feeds the Excel export and the "arrived" WhatsApp audience — a thank-you
      // to someone who said no and never came.
      const rows = (remote?.guests || []).filter(g =>
        remote.seating?.[g.id] === tableId && g.rsvp !== "declined");
      rows.forEach(g => applyArrival(g.id, row => setRowArrived(row, on)));
      return;
    }
    patchEventById(eventId, e => ({
      ...e,
      guests: e.guests.map(g =>
        e.seating?.[g.id] === tableId && g.rsvp !== "declined"
          ? setRowArrived(g, on)
          : g,
      ),
    }));
  }, [canWrite, isToken, remote, applyArrival, patchEventById, eventId]);

  const handleScan = useCallback((raw) => {
    const id = parseScanPayload(raw);
    if (!id) { setScanMsg("קוד לא מזוהה — נסו שוב או חפשו לפי שם"); return; }
    const guest = ev?.guests.find(g => g.id === id);
    if (!guest) { setScanMsg("הקוד לא שייך לאירוע הזה"); return; }
    if (isFullyArrived(guest)) { setScanMsg(`${guest.name} — כל ${seatsOf(guest)} כבר סומנו`); return; }
    markRow(guest, true);
    setScanMsg(`${guest.name} — ${seatsOf(guest)} סומנו כהגיעו`);
  }, [ev?.guests, markRow]);

  // ── Derived, in seats ──────────────────────────────────────────────────────
  const totals = useMemo(
    () => arrivalTotals(ev?.guests, ev?.seating),
    [ev?.guests, ev?.seating],
  );

  const results = useMemo(
    () => searchGuests(ev?.guests || [], search),
    [ev?.guests, search],
  );

  const availability = useMemo(
    () => tableAvailability(ev?.tables, ev?.guests, ev?.seating),
    [ev?.tables, ev?.guests, ev?.seating],
  );

  const freeTables = availability.filter(a => a.free > 0);

  // ── Bail-outs — every hook above this line, on every render ────────────────
  if (isToken && remoteState !== "ready") {
    return (
      <div className={styles.root}>
        <div className={styles.stateWrap}>
          {remoteState === "loading"
            ? <><div className={styles.spinner} aria-hidden="true" /><span className={styles.stateText}>טוען...</span></>
            : <>
                <span className={styles.stateIcon} aria-hidden="true"><Icon name="alert" size={30} /></span>
                <span className={styles.stateText}>
                  {remoteState === "notfound"
                    ? "הקישור אינו תקין או שהאירוע הוסר"
                    : "שגיאת חיבור — נסו לרענן את הדף"}
                </span>
              </>}
        </div>
      </div>
    );
  }
  if (!ev) return loading ? <div aria-busy="true" /> : null;

  const sideLabel = s => (isToken ? "" : getSideLabel(ev, s));
  const tableOf   = g => {
    const tid = ev.seating?.[g.id];
    return tid ? ev.tables.find(t => t.id === tid) : null;
  };

  const addWalkIn = () => {
    const name = walkInName.trim();
    if (!name || !canManage) return;
    const id = uid();
    const newGuest = withArrivedSeats({
      id, name,
      count: walkInCount || 1,
      side: walkInSide,
      group: "הגיע ביום האירוע",
      rsvp: "confirmed",
      phone: "", notes: "", meal: "regular",
      companions: [],
    }, Array.from({ length: walkInCount || 1 }, (_, i) => i));

    patchEventById(eventId, e => ({
      ...e,
      guests: [...e.guests, newGuest],
      seating: walkInTable ? { ...e.seating, [id]: walkInTable } : e.seating,
    }));
    setLastChecked(id);
    setWalkInOpen(false);
    setWalkInName("");
    setWalkInCount(1);
    setWalkInTable("");
    setSearch("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };


  // ── By-table browse ────────────────────────────────────────────────────────
  const tq = norm(tableSearch);
  const tableRows = availability
    .slice()
    .sort((a, b) => (a.table.name || "").localeCompare(b.table.name || "", "he", { numeric: true }))
    .filter(({ table }) => {
      if (!tq) return true;
      if (norm(table.name).includes(tq)) return true;
      // Searching a person in the by-table view must surface their table —
      // that view had no search at all, so a hostess browsing tables had to
      // switch modes and lose her place.
      return (ev.guests || []).some(g =>
        ev.seating?.[g.id] === table.id &&
        searchGuests([g], tableSearch).length > 0,
      );
    });

  const unassigned = (ev.guests || []).filter(g => g.rsvp !== "declined" && !ev.seating?.[g.id]);

  // A plain object, not a useMemo: two of these are defined below the early
  // return above, so a hook here would be conditional. It costs a re-render of
  // the visible rows per render — exactly what happened before the hoist — and
  // the bug that mattered was the REMOUNT, which the hoist alone fixes.
  const rowUi = { canWrite, expanded, isToken, lastChecked, markCount,
                  markRow, markSeat, setExpanded, sideLabel, tableOf };

  return (
    <div className={styles.root}>
      {/* ── Bar ── */}
      <header className={styles.bar}>
        {!isToken && (
          <button className={styles.backBtn} onClick={() => navigate(`/events/${eventId}/seating`)}>
            <Icon name="arrowRight" size={14} /> חזרו
          </button>
        )}
        <div className={styles.barTitle}>
          <span className={styles.barName}>{ev.name || "אירוע"}</span>
          <span className={styles.barRole}>עמדת כניסה</span>
        </div>
        {canManage && (
          <button className={styles.walkInBtn} onClick={() => { setWalkInName(""); setWalkInTable(""); setWalkInOpen(true); }}>
            <Icon name="plus" size={14} /> אורח שהגיע
          </button>
        )}
      </header>

      {/* ── The number. Seats, not rows. ── */}
      <div className={styles.counter}>
        <div className={styles.counterNums}>
          <span className={styles.counterBig}>{totals.arrivedSeats}</span>
          <span className={styles.counterOf}>מתוך {totals.totalSeats} אורחים</span>
          {totals.partialRecords > 0 && (
            <span className={styles.counterPartial}>{totals.partialRecords} משפחות הגיעו חלקית</span>
          )}
        </div>
      </div>
      <div className={styles.progress}>
        <div className={styles.progressFill} style={{ width: totals.pct + "%" }} />
      </div>

      {isToken && !canWrite && (
        <p className={styles.readOnly} role="status">
          <Icon name="lock" size={14} /> הקישור במצב צפייה בלבד — בעל האירוע יכול לפתוח סימון הגעה
        </p>
      )}
      {saveError && <p className={styles.saveError} role="alert">{saveError}</p>}

      {/* ── Tabs ── */}
      <div className={styles.tabs} role="tablist">
        <button
          className={[styles.tab, viewMode === "name" ? styles.tabOn : ""].filter(Boolean).join(" ")}
          onClick={() => setViewMode("name")} role="tab" aria-selected={viewMode === "name"}
        ><Icon name="search" size={15} /> לפי שם</button>
        <button
          className={[styles.tab, viewMode === "table" ? styles.tabOn : ""].filter(Boolean).join(" ")}
          onClick={() => setViewMode("table")} role="tab" aria-selected={viewMode === "table"}
        ><Icon name="hexagon" size={15} /> לפי שולחן</button>
      </div>

      {/* ═══ BY NAME ═══ */}
      {viewMode === "name" && (
        <>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true"><Icon name="search" size={18} /></span>
            <input
              ref={searchRef}
              className={styles.searchInput}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isToken ? "שם האורח או שם מלווה" : "שם האורח, שם מלווה או טלפון"}
              autoComplete="off" inputMode="text" type="search"
              aria-label="חיפוש אורח"
            />
            {search && (
              <button className={styles.clearBtn} onClick={() => { setSearch(""); searchRef.current?.focus(); }} aria-label="נקו חיפוש">
                <Icon name="close" size={15} />
              </button>
            )}
          </div>

          {scanning && <QrScanner onScan={handleScan} onClose={() => { setScanning(false); setScanMsg(""); }} />}
          {scanMsg && <p className={styles.scanMsg} role="status">{scanMsg}</p>}
          {!scanning && isScanSupported() && canWrite && (
            <button className={styles.scanBtn} onClick={() => { setScanning(true); setScanMsg(""); }}>
              <Icon name="camera" size={15} /> סרקו קוד מההזמנה
            </button>
          )}

          {!search && lastChecked && (() => {
            const g = ev.guests.find(x => x.id === lastChecked);
            if (!g) return null;
            const t = tableOf(g);
            return (
              <div className={styles.last}>
                <span className={styles.lastIcon}><Icon name="check" size={16} /></span>
                <span className={styles.lastName}>{g.name}</span>
                <span className={styles.lastCount}>{arrivedCountOf(g)}/{seatsOf(g)}</span>
                {t && <span className={styles.lastTable}>{tableLabel(t)}</span>}
                <button className={styles.lastClose} onClick={() => setLastChecked(null)} aria-label="סגירה">
                  <Icon name="close" size={13} />
                </button>
              </div>
            );
          })()}

          {search && results.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><Icon name="search" size={34} /></span>
              <p className={styles.emptyTitle}>לא נמצא &ldquo;{search.trim()}&rdquo;</p>
              <p className={styles.emptyHint}>{isToken ? "החיפוש עובר גם על שמות המלווים" : "החיפוש עובר גם על שמות המלווים ועל מספרי טלפון"}</p>
              {canManage && (
                <button className={styles.emptyCta} onClick={() => { setWalkInName(search.trim()); setWalkInTable(""); setWalkInOpen(true); }}>
                  <Icon name="plus" size={15} /> הוסיפו כאורח שהגיע עכשיו
                </button>
              )}
            </div>
          )}

          {results.length > 0 && (
            <div className={styles.list}>
              {results.map(({ guest, match, declined }) => (
                <GuestRow
                  ui={rowUi}
                  key={guest.id}
                  g={guest}
                  declined={declined}
                  matchLabel={match.via === "companion" ? match.label : null}
                />
              ))}
            </div>
          )}

          {!search && (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><SectionMark name="checkin" tone="ondark" size={48} /></span>
              <p className={styles.emptyTitle}>הקלידו שם</p>
              <p className={styles.emptyHint}>
                {totals.arrivedSeats > 0
                  ? `${totals.arrivedSeats} אורחים כבר בפנים`
                  : "שם של אורח, של מי שהגיע איתו, או מספר טלפון"}
              </p>
            </div>
          )}
        </>
      )}

      {/* ═══ BY TABLE ═══ */}
      {viewMode === "table" && (
        <>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true"><Icon name="search" size={18} /></span>
            <input
              ref={searchRef}
              className={styles.searchInput}
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              placeholder="מספר שולחן או שם אורח"
              autoComplete="off" inputMode="text" type="search"
              aria-label="חיפוש שולחן"
            />
            {tableSearch && (
              <button className={styles.clearBtn} onClick={() => { setTableSearch(""); searchRef.current?.focus(); }} aria-label="נקו חיפוש">
                <Icon name="close" size={15} />
              </button>
            )}
          </div>

          {canManage && freeTables.length > 0 && (
            <div className={styles.freeStrip}>
              <span className={styles.freeStripLabel}><Icon name="chair" size={14} /> מקומות פנויים עכשיו</span>
              <div className={styles.freeStripList}>
                {freeTables.slice(0, 8).map(({ table, free }) => (
                  <span key={table.id} className={styles.freePill}>
                    {tableLabel(table)} <b>{free}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className={styles.tableList}>
            {tableRows.length === 0 && (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}><SectionMark name="tables" tone="ondark" size={44} /></span>
                <p className={styles.emptyTitle}>{ev.tables.length === 0 ? "לא הוגדרו שולחנות" : "אין שולחן תואם"}</p>
              </div>
            )}
            {tableRows.map(({ table, capacity, taken, free }) => {
              const rows  = (ev.guests || []).filter(g => ev.seating?.[g.id] === table.id && g.rsvp !== "declined");
              const here  = rows.reduce((s, g) => s + arrivedCountOf(g), 0);
              const seats = rows.reduce((s, g) => s + seatsOf(g), 0);
              const allIn = seats > 0 && here === seats;
              return (
                <div key={table.id} className={[styles.tableBlock, allIn ? styles.tableBlockDone : ""].filter(Boolean).join(" ")}>
                  <div className={styles.tableHead}>
                    <TableGlyph shape={table.shape} capacity={capacity || seats} taken={taken} size={24} onDark />
                    <span className={styles.tableName}>{tableLabel(table)}</span>
                    <span className={styles.tableCount}>{here}/{seats}</span>
                    {free > 0 && <span className={styles.tableFree}>{free} פנויים</span>}
                    {canWrite && seats > 0 && (
                      <button
                        className={[styles.tableAll, allIn ? styles.tableAllUndo : ""].filter(Boolean).join(" ")}
                        onClick={() => markTable(table.id, !allIn)}
                      >
                        {allIn ? "בטלו" : <>כולם <Icon name="check" size={13} /></>}
                      </button>
                    )}
                  </div>
                  <div className={styles.tableGuests}>
                    {rows.length === 0
                      ? <span className={styles.tableEmpty}>שולחן ריק</span>
                      : rows.map(g => <GuestRow key={g.id} g={g} compact ui={rowUi} />)}
                  </div>
                </div>
              );
            })}

            {!tq && unassigned.length > 0 && (
              <div className={styles.tableBlock}>
                <div className={styles.tableHead}>
                  <span className={styles.tableName}>לא משובצים</span>
                  <span className={styles.tableCount}>
                    {unassigned.reduce((s, g) => s + arrivedCountOf(g), 0)}/{unassigned.reduce((s, g) => s + seatsOf(g), 0)}
                  </span>
                </div>
                <div className={styles.tableGuests}>
                  {unassigned.map(g => <GuestRow key={g.id} g={g} compact ui={rowUi} />)}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── The door link, and its switch ── */}
      {canManage && (
        <div className={styles.linkCard}>
          <button className={styles.linkToggle} onClick={() => setLinkOpen(o => !o)} aria-expanded={linkOpen}>
            <SectionMark name="hostess" tone="ondark" size={22} />
            <span className={styles.linkTitle}>קישור לדיילת</span>
            <span className={[styles.linkState, ev.hostessWriteActive === false ? styles.linkStateOff : ""].filter(Boolean).join(" ")}>
              {ev.hostessWriteActive === false ? "סימון סגור" : "סימון פתוח"}
            </span>
            <Icon name={linkOpen ? "chevronUp" : "chevronDown"} size={14} />
          </button>
          {linkOpen && (
            <div className={styles.linkBody}>
              <p className={styles.linkText}>
                הדיילת פותחת את הקישור בטלפון שלה, בלי חשבון ובלי סיסמה. היא יכולה
                לחפש אורח ולסמן הגעה — ורק את זה. מספרי טלפון, מתנות והוספת אורחים
                לא נגישים דרכו.
              </p>
              <code className={styles.linkUrl}>{`${window.location.origin}/entrance/${ev.tokens?.hostess || ""}`}</code>
              <div className={styles.linkActions}>
                <button
                  className={styles.linkCopy}
                  onClick={() => guard("הקישור לדיילת", () => navigator.clipboard?.writeText(`${window.location.origin}/entrance/${ev.tokens?.hostess || ""}`))}
                >
                  <Icon name="link" size={15} /> העתיקו קישור
                </button>
                <button
                  className={[styles.linkSwitch, ev.hostessWriteActive === false ? styles.linkSwitchOff : ""].filter(Boolean).join(" ")}
                  onClick={() => patchEventById(eventId, e => ({
                    ...e,
                    hostessWriteActive: e.hostessWriteActive === false,
                  }))}
                >
                  {ev.hostessWriteActive === false
                    ? <><Icon name="unlock" size={15} /> פתחו סימון הגעה</>
                    : <><Icon name="lock" size={15} /> סגרו סימון הגעה</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Walk-in ── */}
      {walkInOpen && canManage && (
        <div className={styles.sheetOverlay} onClick={e => { if (e.target === e.currentTarget) setWalkInOpen(false); }}>
          <div className={styles.sheet} role="dialog" aria-label="אורח שהגיע ביום האירוע">
            <div className={styles.sheetTitle}>אורח שהגיע ולא ברשימה</div>
            <input
              className={styles.sheetInput}
              value={walkInName}
              onChange={e => setWalkInName(e.target.value)}
              placeholder="שם מלא"
              onKeyDown={e => { if (e.key === "Enter") addWalkIn(); }}
              autoFocus
            />
            <div className={styles.sheetRow}>
              <span className={styles.sheetLabel}>כמה אנשים</span>
              <div className={styles.stepper}>
                <button className={styles.stepBtn} onClick={() => setWalkInCount(c => Math.max(1, c - 1))} aria-label="פחות">−</button>
                <span className={styles.stepNum}>{walkInCount}</span>
                <button className={styles.stepBtn} onClick={() => setWalkInCount(c => Math.min(20, c + 1))} aria-label="עוד">+</button>
              </div>
            </div>
            <div className={styles.sheetRow}>
              <span className={styles.sheetLabel}>צד</span>
              <div className={styles.sideBtns}>
                {["bride", "groom"].map(s => (
                  <button
                    key={s}
                    className={[styles.sideBtn, walkInSide === s ? styles.sideBtnOn : ""].filter(Boolean).join(" ")}
                    onClick={() => setWalkInSide(s)}
                  >{sideLabel(s)}</button>
                ))}
              </div>
            </div>

            {/* The answer to "where do I put them" — measured, not guessed. */}
            <div className={styles.sheetLabel}>איפה יש מקום עכשיו</div>
            {freeTables.length === 0 ? (
              <p className={styles.sheetNote}>אין שולחן עם מקום פנוי — האורח יתווסף בלי שיבוץ.</p>
            ) : (
              <div className={styles.freeGrid}>
                {freeTables
                  .filter(a => a.free >= walkInCount)
                  .slice(0, 12)
                  .map(({ table, free }) => (
                    <button
                      key={table.id}
                      className={[styles.freeCard, walkInTable === table.id ? styles.freeCardOn : ""].filter(Boolean).join(" ")}
                      onClick={() => setWalkInTable(id => (id === table.id ? "" : table.id))}
                      aria-pressed={walkInTable === table.id}
                    >
                      <span className={styles.freeCardName}>{tableLabel(table)}</span>
                      <span className={styles.freeCardFree}>{free} פנויים</span>
                    </button>
                  ))}
                {freeTables.filter(a => a.free >= walkInCount).length === 0 && (
                  <p className={styles.sheetNote}>אין שולחן אחד עם {walkInCount} מקומות פנויים.</p>
                )}
              </div>
            )}

            <div className={styles.sheetActions}>
              <button className={styles.sheetSave} onClick={addWalkIn} disabled={!walkInName.trim()}>
                הוסיפו וסמנו כהגיעו
              </button>
              <button className={styles.sheetCancel} onClick={() => setWalkInOpen(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {isToken && (
        <footer className={styles.footer}>
          <span className={styles.footerStar} aria-hidden="true">✦</span>
          <span>כוכב השולחן</span>
        </footer>
      )}
      {gate}
    </div>
  );
}
