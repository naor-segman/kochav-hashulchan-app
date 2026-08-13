import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  fetchCollabEvent, fetchCollabGuests,
  upsertCollabGuest, deleteCollabGuest,
} from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { GROUP_OPTIONS } from "../data/constants.js";
import { uid } from "../utils/uid.js";
import { getSideLabels } from "../utils/eventHelpers.js";
import { hostsLabel } from "../utils/hostsLabel.js";
import { collabRowMissing, exportCollabTableToExcel } from "../utils/exportHelpers.js";
import { COMPANION_NAME_HINT, missingCompanionSeats } from "../utils/guestForm.js";
import styles from "./CollabScreen.module.css";
import Icon from "../components/ui/Icon.jsx";

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

export default function CollabScreen() {
  const { token } = useParams();
  const [ev, setEv] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [rows, setRows] = useState([]);
  // Rows whose last save failed — kept held so the poll can't revert them.
  const [failed, setFailed] = useState(() => new Set());
  const [me, setMe] = useState(() => { try { return localStorage.getItem("collab_me") || ""; } catch { return ""; } });

  const editing   = useRef(new Set());  // row ids being edited locally right now
  const timers    = useRef(new Map());  // id -> debounce timeout
  const serverIds = useRef(new Set());  // ids the server has ever returned

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
      const data = await fetchCollabEvent(token);
      if (cancelled) return;
      if (data) {
        setEv(data); setState("ready");
        const list = await fetchCollabGuests(token);
        if (cancelled) return;
        list.forEach(r => serverIds.current.add(r.id));
        setRows(list);
        // Poll for others' changes (anon has no direct table read for security,
        // so Realtime isn't available — the token RPC is the safe channel).
        if (data.cloudId) {
          poll = setInterval(async () => {
            const fresh = await fetchCollabGuests(token);
            if (!cancelled && Array.isArray(fresh)) mergePolled(fresh);
          }, 3000);
        }
      } else if (!isSupabaseConfigured || import.meta.env.DEV) {
        setEv(MOCK); setState("ready");
      } else {
        setState("notfound");
      }
    })();
    const pending = timers.current;
    return () => { cancelled = true; if (poll) clearInterval(poll); pending.forEach(clearTimeout); };
  }, [token, mergePolled]);

  if (state === "loading")  return <div className={styles.state}><span className={styles.star}>✦</span><p>טוען…</p></div>;
  // The RPCs return nothing both when the token is wrong AND when the host has
  // switched the link off, and from here the two are indistinguishable — so the
  // copy has to cover both without guessing which one happened.
  if (state === "notfound") return (
    <div className={styles.state}>
      <span className={styles.star}><Icon name="alert" size={26} /></span>
      <p>הקישור אינו פעיל</p>
      <p className={styles.stateHint}>ייתכן שבעלי האירוע סגרו אותו, או שהכתובת שגויה. שווה לבקש מהם קישור מעודכן.</p>
    </div>
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
    t.set(row.id, setTimeout(async () => {
      t.delete(row.id);
      try {
        await upsertCollabGuest(token, { ...row, updated_by: me || null });
        editing.current.delete(row.id);
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
    const row = { id: uid(), name: "", phone: "", side: "bride", guest_group: "", guests_count: 1, companions: [], notes: "" };
    setRows(prev => [row, ...prev]);
  };

  const removeRow = async (id) => {
    if (timers.current.has(id)) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
    editing.current.delete(id);
    setRows(prev => prev.filter(r => r.id !== id));
    if (ev.cloudId) { try { await deleteCollabGuest(token, id); } catch { /* ignore */ } }
  };

  const saveMe = (v) => { setMe(v); try { localStorage.setItem("collab_me", v); } catch { /* ignore */ } };

  // Shared with the host's hub so the two cannot drift into exporting different
  // things under the same label. xlsx itself is still loaded on demand inside
  // the helper: a static import made the 416KB spreadsheet writer a hard
  // dependency of this page, which relatives open on their phones to type in
  // names.
  const downloadExcel = () =>
    exportCollabTableToExcel(rows, { eventName: ev.name, sideLabels: sides });

  const completeCount = rows.filter(isComplete).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerMark}>✦</span>
        <span className={styles.headerName}>{ev.name || "רשימת אורחים משותפת"}</span>
      </header>

      <div className={styles.wrapWide}>
        <div className={styles.card}>
          <h1 className={styles.title}>רשימת האורחים המשותפת</h1>
          <p className={styles.sub}>
            כולם עורכים את אותה טבלה יחד, בזמן אמת. הוסיפו את המוזמנים/ות שלכם/ן —
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
          <div className={styles.counts}>
            {rows.length} רשומות · <span className={styles.ok}>{completeCount} מלאות ומסונכרנות</span>
            {rows.length - completeCount > 0 && <> · <span className={styles.warn}>{rows.length - completeCount} חסרות פרטים</span></>}
          </div>
        </div>

        {rows.length === 0 && (
          <div className={styles.card}><p className={styles.emptyHint}>עדיין אין אורחים. לחצו "הוסיפו שורה" כדי להתחיל.</p></div>
        )}

        <div className={styles.rowsList}>
          {rows.map(r => {
            const miss = collabRowMissing(r);
            const complete = miss.length === 0;
            return (
              <div key={r.id} className={[styles.guestCard, complete ? styles.cardOk : styles.cardWarn].join(" ")}>
                <div className={styles.cardTop}>
                  <input className={[styles.input, styles.nameInput].join(" ")} value={r.name || ""} placeholder="שם מלא"
                    onChange={e => editRow(r.id, { name: e.target.value })} />
                  <button className={styles.del} onClick={() => removeRow(r.id)} aria-label="מחיקת שורה" title="מחיקה"><Icon name="close" size={14} /></button>
                </div>
                {failed.has(r.id) && (
                  <p className={styles.saveWarn} role="status">
                    לא נשמר — נסו לערוך שוב כשהחיבור יחזור. מה שהקלדתם נשמר כאן.
                  </p>
                )}

                <input className={[styles.input, styles.phoneInput].join(" ")} value={r.phone || ""} placeholder="טלפון" dir="ltr" inputMode="tel"
                  onChange={e => editRow(r.id, { phone: e.target.value })} />

                <div className={styles.fields3}>
                  <select className={styles.input} value={r.side || ""} onChange={e => editRow(r.id, { side: e.target.value })}>
                    <option value="" disabled>צד</option>
                    <option value="bride">{sides.bride}</option>
                    <option value="groom">{sides.groom}</option>
                  </select>
                  <select className={styles.input} value={r.guest_group || ""} onChange={e => editRow(r.id, { guest_group: e.target.value })}>
                    <option value="" disabled>קבוצה</option>
                    {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select className={styles.input} value={r.guests_count || 1} onChange={e => {
                    const n = Number(e.target.value);
                    editRow(r.id, { guests_count: n, companions: (r.companions || []).slice(0, Math.max(0, n - 1)) });
                  }}>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? "מקום" : "מקומות"}</option>)}
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

        <footer className={styles.footer}>✦ נבנה בכוכב השולחן</footer>
      </div>
    </div>
  );
}
