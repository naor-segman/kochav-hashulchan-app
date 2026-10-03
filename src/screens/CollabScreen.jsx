import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  fetchCollabEvent, fetchCollabGuests,
  upsertCollabGuest, deleteCollabGuest, UNREACHABLE_TEXT,
} from "../utils/publicTokens.js";
import { GROUP_OPTIONS } from "../data/constants.js";
import { uid } from "../utils/uid.js";
import { getSideLabels } from "../utils/eventHelpers.js";
import { hostsLabel } from "../utils/hostsLabel.js";
import { collabRowMissing, exportCollabTableToExcel } from "../utils/exportHelpers.js";
import { COMPANION_NAME_HINT, missingCompanionSeats } from "../utils/guestForm.js";
import styles from "./CollabScreen.module.css";
import Icon from "../components/ui/Icon.jsx";
import { COMPANY } from "../data/company.js";
import { useGuestTitle } from "../hooks/useGuestTitle.js";
import { collabGroupOptions } from "../utils/guestRoutes.js";
import GuestPrivacyNote from "../components/guest/GuestPrivacyNote.jsx";

// DEV mock so the page can be designed without a live token.
const MOCK = { cloudId: null, name: "חתונת נועה וטל", type: "חתונה", brideName: "נועה", groomName: "טל", coupleType: "bride-groom", sideLabels: null };

// A row syncs to the guest list only when every field the seating system needs
// is present. Count always defaults to 1, so it's never "missing".
// The predicate itself lives next to the export that prints it as a status
// column — one definition of "complete", not one per screen.
//
// WHAT "SAVED" MEANS HERE, now that a seat with no name is incomplete (12.8):
// this table auto-saves 600ms after a keystroke, and there is no save button to
// refuse. Blocking the write would mean a relative types a name, the row is
// rejected mid-word, and their typing is the thing at risk — on the one screen
// in the product where the data cannot be reconstructed. So the row is ALWAYS
// saved to the shared table, and "incomplete" is a state it can sit in, exactly
// like a row with no phone has always been able to. What incompleteness costs
// is the sync into the host's guest list — enforced in useCollabSync via this
// same predicate, so the badge and the behaviour cannot disagree.
const isComplete = (r) => collabRowMissing(r).length === 0;

/* The shared table stores a group name of at most 60 characters (the
 * collab_guests CHECK); the host's app let a custom group be longer. Picked
 * here, it was clipped on the way in and reached the host's list as a SECOND,
 * truncated group nobody created (106). A name the table cannot hold is not
 * offered. (The host side should cap new group names at 60 too — not in this
 * file.) */
const GROUP_MAX = 60;
const storableGroups = (groups) =>
  (Array.isArray(groups) ? groups : []).filter(g => typeof g === "string" && [...g.trim()].length <= GROUP_MAX);

export default function CollabScreen() {
  const { token } = useParams();
  const [ev, setEv] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [rows, setRows] = useState([]);
  useGuestTitle(ev && `רשימת האורחים · ${ev.name || ""}`);
  // Rows whose last save failed — kept held so the poll can't revert them.
  const [failed, setFailed] = useState(() => new Set());
  const [deleteFailed, setDeleteFailed] = useState(null);   // the row's name, or null
  const [excelFailed, setExcelFailed]   = useState(false);
  const [me, setMe] = useState(() => { try { return localStorage.getItem("collab_me") || ""; } catch { return ""; } });

  const editing   = useRef(new Set());  // row ids being edited locally right now
  const timers    = useRef(new Map());  // id -> debounce timeout
  const serverIds = useRef(new Set());  // ids the server has ever returned
  const edits     = useRef(new Map());  // id -> edit counter, to know which save is the latest

  // Merge a freshly-polled full list into local state without clobbering rows
  // the user is currently editing or a locally-added row not yet saved.
  const mergePolled = useCallback((list) => {
    list.forEach(r => serverIds.current.add(r.id));
    const byId = new Map(list.map(r => [r.id, r]));
    setRows(prev => {
      const seen = new Set();
      const next = [];
      prev.forEach(r => {
        seen.add(r.id);
        if (editing.current.has(r.id)) { next.push(r); return; } // don't clobber typing
        const fresh = byId.get(r.id);
        // A server row that carries no companions array is a server that does
        // not know about companions — not a row whose names were cleared. It
        // has happened for real: a migration replaced the list RPC with a
        // pre-companions copy, the poll came back without the field, and eight
        // hand-typed names vanished from the screen. Silence is never an
        // instruction to delete.
        //
        // The flip side is deliberate and is the SAME rule the owner's app now
        // obeys (see pickCompanions in useCollabSync.js): an array that IS
        // present — including an empty one — is the table's answer and wins, so
        // a relative deleting the names actually deletes them. The two halves
        // used to disagree about exactly this value: `[]` blanked eight inputs
        // here and was ignored there, and the owner's app then pushed its eight
        // back over the deletion.
        if (fresh) {
          const merged = { ...r, ...fresh };
          // The server trims what it stores. Its copy of "דנה " is "דנה", and
          // written back into the field while the relative is mid-word the next
          // keystroke glued the words: "דנהכהן" (fifth review 30.9). A value
          // that differs only by outer spaces is the same value — keep ours.
          for (const k of ["name", "phone", "guest_group", "notes"]) {
            if (typeof r[k] === "string" && typeof fresh[k] === "string" && r[k].trim() === fresh[k].trim()) merged[k] = r[k];
          }
          if (!Array.isArray(fresh.companions) && Array.isArray(r.companions)) {
            merged.companions = r.companions;
          }
          next.push(merged); return;                              // updated remotely
        }
        if (!serverIds.current.has(r.id)) next.push(r);           // local, not yet saved → keep
        // else: server knew it and it's gone now → deleted remotely → drop
      });
      list.forEach(r => { if (!seen.has(r.id)) next.push(r); });  // new remote rows
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let poll = null;
    (async () => {
      let data, list;
      try {
        data = await fetchCollabEvent(token);
        // Fetched BEFORE the table is shown. A failed first read used to come
        // back as [] and render an empty list — and a relative looking at an
        // empty list adds everyone again (28.9 audit).
        list = data ? await fetchCollabGuests(token) : [];
      } catch {
        if (!cancelled) setState("unreachable");
        return;
      }
      if (cancelled) return;
      if (data) {
        setEv(data); setState("ready");
        list.forEach(r => serverIds.current.add(r.id));
        setRows(list);
        // Poll for others' changes (anon has no direct table read for security,
        // so Realtime isn't available — the token RPC is the safe channel).
        if (data.cloudId) {
          poll = setInterval(async () => {
            try {
              const fresh = await fetchCollabGuests(token);
              if (cancelled || !Array.isArray(fresh)) return;
              // A closed or changed link answers with an empty list, not an
              // error — and merged, it emptied the table in front of the family,
              // who were then told to check their connection when they added a
              // row (fifth review 30.9). An empty answer where there were rows
              // is checked against the link itself.
              if (fresh.length === 0 && serverIds.current.size > 0) {
                const still = await fetchCollabEvent(token);
                if (cancelled) return;
                if (!still) { clearInterval(poll); setState("notfound"); return; }
              }
              mergePolled(fresh);
            } catch { /* a failed poll changes nothing; the next one retries */ }
          }, 3000);
        }
      } else if (import.meta.env.DEV) {             // dev only (106)
        setEv(MOCK); setState("ready");
      } else {
        setState("notfound");
      }
    })();
    const pending = timers.current;
    return () => { cancelled = true; if (poll) clearInterval(poll); pending.forEach(clearTimeout); };
  }, [token, mergePolled]);

  // Every state is the page's one <main> (38a).
  if (state === "loading")  return <main className={styles.state}><span className={styles.star} aria-hidden="true">✦</span><p role="status">טוען…</p></main>;
  // The RPCs return nothing both when the token is wrong AND when the host has
  // switched the link off, and from here the two are indistinguishable — so the
  // copy has to cover both without guessing which one happened.
  if (state === "notfound") return (
    <main className={styles.state}>
      <span className={styles.star}><Icon name="alert" size={26} /></span>
      <h1 className={styles.stateTitle}>הקישור אינו פעיל</h1>
      <p className={styles.stateHint}>ייתכן שבעלי האירוע סגרו אותו, או שהכתובת שגויה. שווה לבקש מהם קישור מעודכן.</p>
      <Link to="/" className={styles.homeLink}>לדף הבית</Link>
    </main>
  );

  if (state === "unreachable") return (
    <main className={styles.state}>
      <span className={styles.star}><Icon name="alert" size={26} /></span>
      <h1 className={styles.stateTitle}>{UNREACHABLE_TEXT.title}</h1>
      <p className={styles.stateHint}>{UNREACHABLE_TEXT.body}</p>
    </main>
  );

  const sides = getSideLabels(ev);

  // Persist a row (debounced). Nameless drafts stay local until they get a name,
  // so clicking "add" doesn't spam the shared table with empty rows.
  //
  // Invariant this depends on: the row we hold must already carry whatever
  // companion names the server has, because upsertCollabGuest always sends a
  // companions array — there is no way to say "leave that column alone". The
  // list RPC is what supplies them (restored in migration
  // 20260811010000_collab_companions_restore.sql); against a database still
  // running the pre-restore RPC, the names are simply not sent to us and the
  // first edit of any field writes an empty list over them.
  const scheduleWrite = (row) => {
    const t = timers.current;
    if (t.has(row.id)) clearTimeout(t.get(row.id));
    if (!(row.name || "").trim() || !ev.cloudId) return;
    const gen = edits.current.get(row.id) || 0;
    t.set(row.id, setTimeout(async () => {
      t.delete(row.id);
      try {
        await upsertCollabGuest(token, { ...row, updated_by: me || null });
        // Released only if this save is the LATEST edit and no newer one is
        // waiting. A slow save finishing after the next keystroke released the
        // row, the poll wrote the older copy into the field, and the letters
        // typed in between were lost for good (fifth review 30.9).
        if ((edits.current.get(row.id) || 0) === gen && !t.has(row.id)) editing.current.delete(row.id);
        setFailed(prev => { const n = new Set(prev); n.delete(row.id); return n; });
      } catch {
        // Do NOT release the row. Clearing `editing` on failure let the 3s poll
        // overwrite the user's typing with the stale server value — they'd
        // watch a phone number they had just corrected snap back, with no error
        // shown anywhere. Keep it held and say so.
        setFailed(prev => new Set(prev).add(row.id));
      }
    }, 600));
  };

  const editRow = (id, patch) => {
    editing.current.add(id);
    edits.current.set(id, (edits.current.get(id) || 0) + 1);
    setRows(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, ...patch } : r));
      scheduleWrite(next.find(r => r.id === id));
      return next;
    });
  };

  // Set one companion name at a position, keeping the array sized to count-1.
  const editCompanion = (row, idx, value) => {
    const comp = Array.isArray(row.companions) ? [...row.companions] : [];
    while (comp.length <= idx) comp.push("");
    comp[idx] = value;
    editRow(row.id, { companions: comp.slice(0, Math.max(0, (row.guests_count || 1) - 1)) });
  };

  const addRow = () => {
    // Side starts UNSET, like group. It defaulted to "bride", so every row the
    // groom's family added without touching the select was filed on the
    // bride's side — complete, synced, and wrong (89 #8). Side is a required
    // field (collabRowMissing), so an unset one says "חסר: צד" until chosen.
    const row = { id: uid(), name: "", phone: "", side: "", guest_group: "", guests_count: 1, companions: [], notes: "" };
    setRows(prev => [row, ...prev]);
  };

  const removeRow = async (id) => {
    // Whether the row had typing not yet saved — a pending write, or a save
    // that failed and is held. If the delete fails, that typing is still the
    // relative's and still has to reach the table.
    const hadPending = timers.current.has(id);
    const wasHeld    = editing.current.has(id);
    if (hadPending) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
    editing.current.delete(id);
    const gone = rows.find(r => r.id === id);
    setRows(prev => prev.filter(r => r.id !== id));
    if (!ev.cloudId) return;
    try {
      await deleteCollabGuest(token, id);
      setDeleteFailed(null);
    } catch {
      // A failed delete used to be silent: the row vanished and came back on
      // the next 3-second poll, with no word why (second review, סב36). Put it
      // back now and say so.
      //
      // NOT held as "editing" unless it had unsaved typing (71c): nothing ever
      // released that hold — no edit was pending to finish — so the row froze,
      // and the poll could never again show what another relative changed in
      // it. With unsaved typing, the write is rescheduled and releases the row
      // itself once it lands.
      if (gone) {
        setRows(prev => (prev.some(r => r.id === id) ? prev : [gone, ...prev]));
        if (wasHeld) editing.current.add(id);
        if (hadPending) scheduleWrite(gone);
      }
      setDeleteFailed(gone?.name?.trim() || "השורה");
    }
  };

  const saveMe = (v) => { setMe(v); try { localStorage.setItem("collab_me", v); } catch { /* ignore */ } };

  // Shared with the host's hub so the two cannot drift into exporting different
  // things under the same label. xlsx itself is still loaded on demand inside
  // the helper: a static import made the 416KB spreadsheet writer a hard
  // dependency of this page, which relatives open on their phones to type in
  // names.
  //
  // The spreadsheet writer is a separate chunk, fetched on the tap — on a
  // phone with a bad line that fetch fails, and the button did nothing at all,
  // with an unhandled rejection behind it (89). Say so.
  const downloadExcel = async () => {
    setExcelFailed(false);
    try {
      await exportCollabTableToExcel(rows, { eventName: ev.name, sideLabels: sides });
    } catch {
      setExcelFailed(true);
    }
  };

  const completeCount = rows.filter(isComplete).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerMark}>✦</span>
        <span className={styles.headerName}>{ev.name || "רשימת אורחים משותפת"}</span>
      </header>

      <div className={styles.wrapWide}>
        {/* The page's one landmark (38a) — inside the column so the footer
            stays outside it. Unstyled; the column lays out as before. */}
        <main>
        <div className={styles.card}>
          <h1 className={styles.title}>רשימת האורחים המשותפת</h1>
          <p className={styles.sub}>
            כולם עורכים את אותה טבלה יחד, בזמן אמת. הוסיפו את המוזמנים שלכם —
            שם וטלפון בהקלדה או מרשימה. רשומה מלאה נכנסת אוטומטית לרשימה של {hostsLabel(ev)}.
          </p>

          <label className={styles.meRow}>
            <span className={styles.meLabel}>השם שלכם (אופציונלי)</span>
            <input className={styles.input} value={me} placeholder="כדי שידעו מי הוסיף"
              onChange={e => saveMe(e.target.value)} />
          </label>

          <div className={styles.toolbar}>
            <button className={styles.btn} onClick={addRow}>+ הוסיפו שורה</button>
            {/* The label says WHICH list you get. A plain "הורדה לאקסל" is also
                the guest manager's button, which hands you a different file. */}
            <button className={styles.btnGhost} onClick={downloadExcel} disabled={rows.length === 0}><Icon name="download" /> הורדת הטבלה לאקסל</button>
          </div>
          {excelFailed && (
            <p className={styles.saveWarn} role="alert">ההורדה לא הצליחה — בדקו את החיבור ונסו שוב.</p>
          )}
          <GuestPrivacyNote text="מה שתוסיפו גלוי לכל מי שיש לו את הקישור לטבלה, ועובר לבעלי האירוע." />
          <div className={styles.counts}>
            {rows.length} רשומות · <span className={styles.ok}>{completeCount} מלאות ומסונכרנות</span>
            {rows.length - completeCount > 0 && <> · <span className={styles.warn}>{rows.length - completeCount} חסרות פרטים</span></>}
          </div>
        </div>

        {rows.length === 0 && (
          <div className={styles.card}><p className={styles.emptyHint}>עדיין אין אורחים. לחצו "הוסיפו שורה" כדי להתחיל.</p></div>
        )}

        {deleteFailed && (
          <p className={styles.saveWarn} role="alert">
            המחיקה של {deleteFailed} לא נשמרה — בדקו חיבור ונסו שוב.
          </p>
        )}
        <div className={styles.rowsList}>
          {rows.map(r => {
            const miss = collabRowMissing(r);
            const complete = miss.length === 0;
            return (
              <div key={r.id} className={[styles.guestCard, complete ? styles.cardOk : styles.cardWarn].join(" ")}>
                <div className={styles.cardTop}>
                  <input className={[styles.input, styles.nameInput].join(" ")} value={r.name || ""} placeholder="שם מלא" aria-label="שם מלא"
                    onChange={e => editRow(r.id, { name: e.target.value })} />
                  <button className={styles.del} onClick={() => removeRow(r.id)} aria-label="מחיקת שורה" title="מחיקה"><Icon name="close" size={14} /></button>
                </div>
                {failed.has(r.id) && (
                  <p className={styles.saveWarn} role="status">
                    לא נשמר — נסו לערוך שוב כשהחיבור יחזור. מה שהקלדתם נשמר כאן.
                  </p>
                )}

                <input className={[styles.input, styles.phoneInput].join(" ")} value={r.phone || ""} placeholder="טלפון" aria-label="טלפון" dir="ltr" inputMode="tel"
                  onChange={e => editRow(r.id, { phone: e.target.value })} />

                <div className={styles.fields3}>
                  <select className={styles.input} aria-label="צד" value={r.side || ""} onChange={e => editRow(r.id, { side: e.target.value })}>
                    <option value="" disabled>צד</option>
                    <option value="bride">{sides.bride}</option>
                    <option value="groom">{sides.groom}</option>
                  </select>
                  <select className={styles.input} aria-label="קבוצה" value={r.guest_group || ""} onChange={e => editRow(r.id, { guest_group: e.target.value })}>
                    <option value="" disabled>קבוצה</option>
                    {collabGroupOptions(GROUP_OPTIONS, storableGroups(ev.customGroups), r.guest_group).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select className={styles.input} aria-label="מספר מקומות" value={r.guests_count || 1} onChange={e => {
                    const n = Number(e.target.value);
                    editRow(r.id, { guests_count: n, companions: (r.companions || []).slice(0, Math.max(0, n - 1)) });
                  }}>
                    {/* Up to the row's own count when the host set more than 20
                        (their form allows 50): a row of 25 showed "1 מקום" beside
                        24 companion boxes (second review, סב36). */}
                    {Array.from({ length: Math.max(20, Number(r.guests_count) || 1) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? "מקום" : "מקומות"}</option>)}
                  </select>
                </div>

                {(r.guests_count || 1) > 1 && (
                  <div className={styles.companions}>
                    {/* The label has to say WHO these people are. "שמות
                        המלווים" told a first-time reader nothing — and the
                        reason to bother is worth far more than the word
                        "רשות": names are what make the seating work. */}
                    <span className={styles.companionsLabel}>
                      {(r.guests_count || 1) - 1 === 1
                        ? <>מי האדם שמצטרף {r.name?.trim() ? "ל" + r.name.trim() : "לשורה הזו"}?</>
                        : <>מי {(r.guests_count || 1) - 1} האנשים שמצטרפים {r.name?.trim() ? "ל" + r.name.trim() : "לשורה הזו"}?</>}
                    </span>
                    {/* Was "אפשר לדלג". It is no longer possible to skip and
                        still have the row count, so the copy says what to type
                        instead of what is forbidden — a relationship word is a
                        real answer, and it is a far better one than a chair
                        with nobody on it. */}
                    <span className={styles.companionsWhy}>
                      {COMPANION_NAME_HINT}. שם על כל מקום הוא מה שמאפשר להושיב אותם נכון,
                      ובכניסה לזהות אותם בלי לחפש.
                    </span>
                    {Array.from({ length: (r.guests_count || 1) - 1 }, (_, i) => (
                      <input
                        key={i}
                        className={[styles.input, styles.companionInput].join(" ")}
                        value={(r.companions && r.companions[i]) || ""}
                        placeholder={`שם ${i + 1} — או ״בעל״ / ״חבר״`}
                        aria-label={`שם המצטרף ${i + 1}`}
                        onChange={e => editCompanion(r, i, e.target.value)}
                      />
                    ))}
                  </div>
                )}

                {/* The field the host has had all along and the family did not.
                    Free text, one line: allergies, accessibility, "יושבים עם
                    הסבים". It syncs into the guest's own הערות. */}
                <input
                  className={[styles.input, styles.notesInput].join(" ")}
                  value={r.notes || ""}
                  maxLength={500}
                  placeholder="הערות — אלרגיה, נגישות, ״יושבים עם הסבים״ (לא חובה)"
                  aria-label="הערות"
                  onChange={e => editRow(r.id, { notes: e.target.value })}
                />

                {complete
                  ? <div className={styles.rowOk}><Icon name="check" size={13} /> מלאה — מסונכרנת לרשימה</div>
                  : (
                    <div className={styles.rowWarn}>
                      <Icon name="alert" size={13} /> חסר: {miss.join(", ")} — לא תסתנכרן עד שיושלם
                      {/* Never a scolding, always an instruction: the one case
                          where a person can be genuinely stuck is not knowing
                          the name, so say what to write. */}
                      {missingCompanionSeats(r.companions, r.guests_count).length > 0 && (
                        <span className={styles.rowWarnHint}>{COMPANION_NAME_HINT}</span>
                      )}
                    </div>
                  )}
                {r.updated_by && <div className={styles.byLine}>עודכן ע"י {r.updated_by}</div>}
              </div>
            );
          })}
        </div>
        </main>

        <footer className={styles.footer}>
          <Link to="/" className={styles.footerLink}><span aria-hidden="true">✦</span> נבנה עם {COMPANY.name}</Link>
        </footer>
      </div>
    </div>
  );
}
