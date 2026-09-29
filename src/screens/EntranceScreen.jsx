import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { tableLabel } from "../components/seating/tableLabel.js";
import { getSideLabel, rotateEventToken } from "../utils/eventHelpers.js";
import { uid } from "../utils/uid.js";
import {
  seatsOf, arrivedSeatsOf, arrivedCountOf, isFullyArrived, withArrivedSeats,
  setRowArrived, toggleSeat, setArrivedCount, arrivalTotals, searchGuests,
  seatChipLabels, tableAvailability, norm, mergeArrivals,
} from "../utils/arrival.js";
import { fetchHostessData, markArrivalByToken } from "../utils/publicTokens.js";
import { fetchCloudEventGuests } from "../utils/cloudSync.js";
import { isScanSupported, parseScanPayload } from "../utils/scanPayload.js";
import QrScanner from "../components/ui/QrScanner.jsx";
import TableGlyph from "../components/ui/TableGlyph.jsx";
import Icon from "../components/ui/Icon.jsx";
import SectionMark from "../components/ui/SectionMark.jsx";
import styles from "./EntranceScreen.module.css";
import { useShareGate } from "../components/share/useShareGate.jsx";
import { useConfirm } from "../components/ui/useConfirm.jsx";
import { COMPANY } from "../data/company.js";
import { useGuestTitle } from "../hooks/useGuestTitle.js";

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

/** Same seat set, order-free. */
const DOUBLE_TAP_MS = 600;

/** A multiset of guest ids with a write on the wire: has / add / delete / size. */
function pendingWrites() {
  const n = new Map();
  return {
    has: id => n.has(id),
    add: id => { n.set(id, (n.get(id) || 0) + 1); },
    delete: id => { const k = (n.get(id) || 0) - 1; if (k > 0) n.set(id, k); else n.delete(id); },
    get size() { return n.size; },
  };
}

const sameSeats = (a, b) => a.length === b.length && a.every(x => b.includes(x));

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
  // When the list on screen is not fresh: the time it was fetched, while the
  // last refresh failed. null when the last refresh worked.
  const [staleAt, setStaleAt] = useState(null);
  useGuestTitle(isToken && remote && `כניסה · ${remote.name || ""}`);

  // Guests with a write still in flight. A refresh that landed mid-write used to
  // overwrite them with the server's pre-write state: the greeter's correction
  // vanished from the screen for up to 25 seconds and — worse — the next tap read
  // that stale copy and wrote it back, silently undoing the correction in the
  // database. Measured: untick יעל, poll lands, untick איתי, and יעל is present
  // again on the server.
  //
  // COUNTED, not a Set (second review, סב22): two taps on one family with the
  // first still on the wire — the first reply deleted the id, the row lost its
  // protection while the second write was still going, a refresh landed, and
  // the screen showed the family as the server had it BEFORE the second tap.
  const inFlight = useRef(pendingWrites());
  // Rows whose last save failed. The error stays on screen until THAT row saves;
  // a good tap on another family used to clear it while the failed one still
  // looked checked in (29.9 review).
  //
  // An outbox, not a list of ids (second review, סב12): each entry keeps what
  // the tap MEANT — the seats it asked for and the seats the screen showed — so
  // the write is sent again after the next refresh that works. Before, a tap
  // in a dead spot reverted, the error named nobody, nothing was ever re-sent
  // (3 sent, 0 applied once the signal was back), and the message stayed up
  // even after the other greeter had checked those families in.
  const failed = useRef(new Map());   // guestId → { name, seats, base }
  const showFailed = useCallback(() => {
    const names = [...failed.current.values()].map(f => f.name).filter(Boolean);
    setSaveError(failed.current.size === 0 ? ""
      : `לא נשמר: ${names.join(", ") || "סימון הגעה"} — ננסה שוב אוטומטית כשהחיבור יחזור`);
  }, []);
  // The list as the greeter last saw it, readable synchronously by a tap. The
  // write path below must not depend on WHEN React runs a state updater.
  const remoteRef = useRef(null);
  useEffect(() => { remoteRef.current = remote; }, [remote]);

  // The last list that loaded, for this tab only (sessionStorage: it survives
  // a pull-to-refresh or iOS reloading a tab it put to sleep, and is gone when
  // the tab closes — a guest list does not outlive the greeter's shift).
  // Without it, a reload with no signal replaced the whole door with "שגיאת
  // חיבור — נסו לרענן את הדף", advice that cannot work offline (סב12).
  const cacheKey = `kh_door:${token}`;
  const readCache = useCallback(() => {
    try { return JSON.parse(sessionStorage.getItem(cacheKey) || "null"); } catch { return null; }
  }, [cacheKey]);

  // Re-send what failed, now that the server answers. A row the server already
  // shows as asked (the other greeter did it) is simply done.
  const retryFailed = useCallback((data) => {
    if (!data?.writesOpen) return;
    for (const [guestId, f] of failed.current) {
      if (inFlight.current.has(guestId)) continue;
      const row = data.guests.find(g => g.id === guestId);
      if (!row) { failed.current.delete(guestId); continue; }
      if (sameSeats(arrivedSeatsOf(row), f.seats)) { failed.current.delete(guestId); continue; }
      inFlight.current.add(guestId);
      markArrivalByToken(token, guestId, f.seats, f.base)
        .then(() => {
          inFlight.current.delete(guestId);
          if (failed.current.get(guestId) === f) failed.current.delete(guestId);
          showFailed();
          const put = prev => prev && ({ ...prev, guests: prev.guests.map(g =>
            g.id === guestId ? withArrivedSeats(g, f.seats) : g) });
          remoteRef.current = put(remoteRef.current);
          setRemote(put);
        })
        .catch(() => { inFlight.current.delete(guestId); });
    }
    showFailed();
  }, [token, showFailed]);

  const loadRemote = useCallback(async () => {
    try {
      const data = await fetchHostessData(token);
      if (!data) { setRemoteState("notfound"); return null; }
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data })); } catch { /* full or blocked */ }
      setStaleAt(null);
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
      retryFailed(data);
      return data;
    } catch {
      // A failed REFRESH keeps the list on screen. Replacing a working door
      // list with an error because one 25-second poll hit a dead spot in the
      // hall is worse than showing data that is 25 seconds old (28.9 audit).
      // Only a first load with nothing to show becomes the error state.
      if (!remoteRef.current) {
        const cached = readCache();
        if (cached?.data) {
          remoteRef.current = cached.data;
          setRemote(cached.data);
          setRemoteState("ready");
          setStaleAt(cached.at);
          return null;
        }
      }
      setRemoteState(s => (s === "ready" ? "ready" : "error"));
      setStaleAt(t => t ?? readCache()?.at ?? null);
      return null;
    }
  }, [token, cacheKey, readCache, retryFailed]);

  useEffect(() => {
    if (!isToken) return undefined;
    let alive = true;
    (async () => { if (alive) await loadRemote(); })();
    // Two greeters can work the same door. A slow refresh is enough to stop
    // them double-marking each other's guests; anything faster burns battery
    // on a phone that has to last the whole evening.
    const iv = setInterval(() => { if (alive) loadRemote(); }, 25000);
    // The signal is back: refresh now (and re-send what failed) instead of
    // waiting out the rest of the 25 seconds.
    const online = () => { if (alive) loadRemote(); };
    window.addEventListener("online", online);
    return () => { alive = false; clearInterval(iv); window.removeEventListener("online", online); };
  }, [isToken, loadRemote]);

  const localEvent = isToken ? null : events.find(e => e.id === eventId);

  useEffect(() => {
    if (isToken) return;
    // "/app", not "/". Every other event route sends an unknown id to the
    // dashboard; this one dropped the host onto the public sales page.
    if (!loading && !localEvent) navigate("/app", { replace: true });
  }, [isToken, loading, localEvent, navigate]);

  // ── The host's own door: the greeter's marks while this screen is open ─────
  // WORKPLAN ב2. The greeter writes to the cloud; this screen read only the
  // local copy, so a host standing at the door saw none of the greeter's
  // check-ins until a reload. It now reads its own cloud row every 25s (the
  // greeter's cadence) and overlays arrivals with the SAME per-row timestamp
  // rule the sync merge uses. Display only: nothing is written, the sync
  // engine is untouched, and a failed read keeps the last good overlay.
  const ownerCloudId = !isToken ? localEvent?.cloudId : null;
  const [cloudGuests, setCloudGuests] = useState(null);
  useEffect(() => {
    if (!ownerCloudId) return undefined;
    let alive = true;
    const pull = async () => {
      try {
        const g = await fetchCloudEventGuests(ownerCloudId);
        if (alive && g) setCloudGuests({ forId: ownerCloudId, guests: g });
      } catch { /* keep the last overlay; the next pull retries */ }
    };
    pull();
    const iv = setInterval(pull, 25000);
    return () => { alive = false; clearInterval(iv); };
  }, [ownerCloudId]);
  // The latest overlay, for the write path below: a host's tap must start
  // from the row as the screen SHOWS it. Starting from the local row, a tap on
  // seat 2 of a family the greeter had marked seat 1 of would be stamped newer
  // and, by the merge's last-writer rule, drop the greeter's seat.
  const cloudGuestsRef = useRef(null);
  useEffect(() => {
    cloudGuestsRef.current = cloudGuests && cloudGuests.forId === localEvent?.cloudId ? cloudGuests.guests : null;
  }, [cloudGuests, localEvent?.cloudId]);
  const ownerEvent = useMemo(() => {
    if (!localEvent || !cloudGuests || cloudGuests.forId !== localEvent.cloudId) return localEvent;
    return { ...localEvent, guests: mergeArrivals(localEvent.guests, cloudGuests.guests) };
  }, [localEvent, cloudGuests]);

  // ── One shape for both modes ───────────────────────────────────────────────
  const ev = isToken
    ? (remote && {
        id: remote.cloudId,
        name: remote.name,
        guests: remote.guests,
        tables: remote.tables,
        seating: remote.seating,
      })
    : ownerEvent;

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
  const { confirm, dialog } = useConfirm();
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
      // Worked out HERE, synchronously, from the list on screen. Until 29.9
      // these were assigned inside the setRemote updater and sent from a
      // microtask — which works for a click (React renders before the
      // microtask) and NOT for a QR scan, whose callback runs from
      // requestAnimationFrame after an await: the updater had not run yet,
      // both lists were null, and every scanned check-in on a greeter's link
      // went to the server as "seats [] from []" — a no-op that succeeded.
      // The screen showed the guest in; 25 seconds later they were gone.
      const cur = remoteRef.current;
      const row = cur?.guests.find(g => g.id === guestId);
      if (!row) return;
      const next      = transform(row);
      const baseSeats = arrivedSeatsOf(row);   // what this screen showed (ג2)
      const nextSeats = arrivedSeatsOf(next);
      const put = r => (prev => prev && ({ ...prev, guests: prev.guests.map(g => (g.id === guestId ? r(g) : g)) }));
      remoteRef.current = put(() => next)(cur);   // a second tap before the render sees this one
      setRemote(put(() => next));
      // Optimistic locally, authoritative in Postgres. A failure has to be
      // visible: a greeter who thinks a family is checked in when the host's
      // list says otherwise is worse than no check-in at all.
      // A new tap on a row is the greeter's new intent: it replaces whatever
      // was waiting to be re-sent for that row.
      failed.current.delete(guestId);
      showFailed();
      inFlight.current.add(guestId);
      markArrivalByToken(token, guestId, nextSeats, baseSeats)
        .then(() => {
          inFlight.current.delete(guestId);
          showFailed();
        })
        .catch(() => {
          inFlight.current.delete(guestId);
          failed.current.set(guestId, { name: row.name, seats: nextSeats, base: baseSeats });
          // A scan's "סומנו כהגיעו" under the camera must not outlive the save
          // it announced (סב23).
          setScanMsg(m => (m.startsWith(`${row.name} — `) ? `${row.name} — לא נשמר, ננסה שוב כשהחיבור יחזור` : m));
          // Put the row back as it was, unless a later tap has changed it
          // since — offline, the refresh below fails too and nothing else
          // would undo the optimistic mark.
          setRemote(put(g => (sameSeats(arrivedSeatsOf(g), nextSeats) ? withArrivedSeats(g, baseSeats) : g)));
          showFailed();
          loadRemote();
        });
    } else {
      const shown = g => (cloudGuestsRef.current ? mergeArrivals([g], cloudGuestsRef.current)[0] : g);
      patchEventById(eventId, e => ({
        ...e,
        guests: e.guests.map(g => (g.id === guestId ? transform(shown(g)) : g)),
      }));
    }
  }, [canWrite, isToken, token, eventId, patchEventById, loadRemote, showFailed]);

  // A second tap on the same big button within a moment is a double tap, not
  // a change of mind: two taps 180 ms apart on "כולם הגיעו" sent [0,1,2] and
  // then [] — the family, or with "כולם" the whole table, un-checked at the
  // busiest moment of the evening, no confirm and no undo (second review, סב24).
  const lastTap = useRef(new Map());
  const isDoubleTap = useCallback((key) => {
    const now = Date.now(), prev = lastTap.current.get(key);
    lastTap.current.set(key, now);
    return prev !== undefined && now - prev < DOUBLE_TAP_MS;
  }, []);

  const markRow = useCallback((g, on) => {
    if (isDoubleTap("row:" + g.id)) return;
    applyArrival(g.id, row => setRowArrived(row, on));
    if (on) setLastChecked(g.id);
  }, [applyArrival, isDoubleTap]);

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
    if (isDoubleTap("table:" + tableId)) return;
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
  }, [canWrite, isToken, remote, applyArrival, patchEventById, eventId, isDoubleTap]);

  const handleScan = useCallback((raw) => {
    // The host can close the door link while the camera is open. Before, the
    // scan still said "3 סומנו כהגיעו" and sent nothing (second review, סב23).
    if (!canWrite) { setScanning(false); setScanMsg("הקישור במצב צפייה בלבד — לא סומן"); return; }
    const id = parseScanPayload(raw);
    if (!id) { setScanMsg("קוד לא מזוהה — נסו שוב או חפשו לפי שם"); return; }
    const guest = ev?.guests.find(g => g.id === id);
    if (!guest) { setScanMsg("הקוד לא שייך לאירוע הזה"); return; }
    if (isFullyArrived(guest)) { setScanMsg(`${guest.name} — כל ${seatsOf(guest)} כבר סומנו`); return; }
    markRow(guest, true);
    setScanMsg(`${guest.name} — ${seatsOf(guest)} סומנו כהגיעו`);
  }, [canWrite, ev?.guests, markRow]);

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
                <h1 className={styles.stateText}>
                  {remoteState === "notfound"
                    ? "הקישור אינו תקין או שהאירוע הוסר"
                    : "אין חיבור כרגע — הרשימה תופיע ברגע שהחיבור יחזור"}
                </h1>
                {remoteState === "notfound" && <Link to="/" className={styles.homeLink}>לדף הבית</Link>}
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

    // The table is checked again HERE, against the party size being added.
    // The picker hides tables without room for the current count, but a table
    // chosen for two stayed selected after the count went up to four, and the
    // family was seated at a table with room for two (107, 29.9).
    const room = freeTables.find(a => a.table.id === walkInTable)?.free ?? 0;
    const seatAt = walkInTable && room >= (walkInCount || 1) ? walkInTable : "";
    patchEventById(eventId, e => ({
      ...e,
      guests: [...e.guests, newGuest],
      seating: seatAt ? { ...e.seating, [id]: seatAt } : e.seating,
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
      {dialog}
      {/* ── Bar ── */}
      <header className={styles.bar}>
        {!isToken && (
          <button className={styles.backBtn} onClick={() => navigate(`/events/${eventId}/seating`)}>
            <Icon name="arrowRight" size={14} /> חזרו
          </button>
        )}
        <div className={styles.barTitle}>
          <h1 className={styles.barName}>{ev.name || "אירוע"}</h1>
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
      {isToken && staleAt && (
        <p className={styles.readOnly} role="status">
          <Icon name="alert" size={14} /> אין חיבור כרגע — הרשימה מעודכנת לשעה {new Date(staleAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
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

          {scanning && canWrite && <QrScanner onScan={handleScan} onClose={() => { setScanning(false); setScanMsg(""); }} />}
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
                {/* The door link could be switched to read-only but never
                    revoked: whoever held it could still open the full guest
                    list with every table (102, 28.9). Same rotation as the
                    family table's link, same wording of what is lost. */}
                <button
                  className={styles.linkCopy}
                  onClick={async () => {
                    const ok = await confirm(
                      "להחליף את הקישור לדיילת?\n\n"
                      // "ברגע שהשינוי נשמר", not "מיד": the old link dies when
                      // the new token reaches the server, and offline that is
                      // later (29.9 review — the dialog promised more).
                      + "הקישור הנוכחי יפסיק לעבוד ברגע שהשינוי יישמר — גם בטלפון של דיילת שכבר פתחה אותו. "
                      + "הסימונים שכבר נעשו נשארים. תצטרכו לשלוח לדיילת את הקישור החדש.",
                      { danger: true, confirmLabel: "החליפו את הקישור" },
                    );
                    if (ok) patchEventById(eventId, e => rotateEventToken(e, "hostess"));
                  }}
                >
                  <Icon name="refresh" size={15} /> החליפו קישור
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
                {walkInTable && !freeTables.some(a => a.table.id === walkInTable && a.free >= walkInCount) && (
                  <p className={styles.sheetNote}>בשולחן שבחרתם אין מקום ל-{walkInCount} — בחרו שולחן אחר, או שהאורח יתווסף בלי שיבוץ.</p>
                )}
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
          <span>{COMPANY.name}</span>
        </footer>
      )}
      {gate}
    </div>
  );
}
