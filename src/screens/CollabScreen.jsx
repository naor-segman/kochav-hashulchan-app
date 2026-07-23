import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  fetchCollabEvent, fetchCollabGuests,
  upsertCollabGuest, deleteCollabGuest,
} from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { GROUP_OPTIONS } from "../data/constants.js";
import { uid } from "../utils/uid.js";
import { getSideLabels } from "../utils/eventHelpers.js";
import styles from "./CollabScreen.module.css";

// DEV mock so the page can be designed without a live token.
const MOCK = { cloudId: null, name: "חתונת נועה וטל", type: "חתונה", brideName: "נועה", groomName: "טל", coupleType: "bride-groom", sideLabels: null };

// A row syncs to the guest list only when every field the seating system needs
// is present. Count always defaults to 1, so it's never "missing".
function missingFields(r) {
  const m = [];
  if (!(r.name || "").trim())  m.push("שם");
  if (!(r.phone || "").trim()) m.push("טלפון");
  if (!r.side)                 m.push("צד");
  if (!r.guest_group)          m.push("קבוצה");
  return m;
}
const isComplete = (r) => missingFields(r).length === 0;

export default function CollabScreen() {
  const { token } = useParams();
  const [ev, setEv] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [rows, setRows] = useState([]);
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
        if (fresh) { next.push({ ...r, ...fresh }); return; }     // updated remotely
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
  if (state === "notfound") return <div className={styles.state}><span className={styles.star}>⚠</span><p>הקישור אינו תקין או שפג תוקפו</p></div>;

  const sides = getSideLabels(ev);

  // Persist a row (debounced). Nameless drafts stay local until they get a name,
  // so clicking "add" doesn't spam the shared table with empty rows.
  const scheduleWrite = (row) => {
    const t = timers.current;
    if (t.has(row.id)) clearTimeout(t.get(row.id));
    if (!(row.name || "").trim() || !ev.cloudId) return;
    t.set(row.id, setTimeout(async () => {
      t.delete(row.id);
      try { await upsertCollabGuest(token, { ...row, updated_by: me || null }); }
      catch { /* transient — next edit retries */ }
      editing.current.delete(row.id);
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

  const addRow = () => {
    const row = { id: uid(), name: "", phone: "", side: "bride", guest_group: "", guests_count: 1 };
    setRows(prev => [row, ...prev]);
  };

  const removeRow = async (id) => {
    if (timers.current.has(id)) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
    editing.current.delete(id);
    setRows(prev => prev.filter(r => r.id !== id));
    if (ev.cloudId) { try { await deleteCollabGuest(token, id); } catch { /* ignore */ } }
  };

  const saveMe = (v) => { setMe(v); try { localStorage.setItem("collab_me", v); } catch { /* ignore */ } };

  const downloadExcel = () => {
    const aoa = [["שם מלא", "טלפון", "צד", "קבוצה", "כמות"]];
    rows.forEach(r => aoa.push([r.name || "", r.phone || "", sides[r.side] || "", r.guest_group || "", r.guests_count || 1]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 7 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "רשימת אורחים");
    XLSX.writeFile(wb, `אורחים-${(ev.name || "אירוע").replace(/[^\p{L}\p{N} -]/gu, "")}.xlsx`);
  };

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
            כולם עורכים את אותה טבלה יחד, בזמן אמת. הוסיפו את מי שאתם מכירים —
            שם וטלפון בהקלדה, השאר מרשימה. רשומה מלאה נכנסת אוטומטית לרשימה של בעלי השמחה.
          </p>

          <label className={styles.meRow}>
            <span className={styles.meLabel}>השם שלכם (אופציונלי)</span>
            <input className={styles.input} value={me} placeholder="כדי שידעו מי הוסיף"
              onChange={e => saveMe(e.target.value)} />
          </label>

          <div className={styles.toolbar}>
            <button className={styles.btn} onClick={addRow}>+ הוסיפו שורה</button>
            <button className={styles.btnGhost} onClick={downloadExcel} disabled={rows.length === 0}>⬇ הורדה לאקסל</button>
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
            const miss = missingFields(r);
            const complete = miss.length === 0;
            return (
              <div key={r.id} className={[styles.guestCard, complete ? styles.cardOk : styles.cardWarn].join(" ")}>
                <div className={styles.cardTop}>
                  <input className={[styles.input, styles.nameInput].join(" ")} value={r.name || ""} placeholder="שם מלא"
                    onChange={e => editRow(r.id, { name: e.target.value })} />
                  <button className={styles.del} onClick={() => removeRow(r.id)} aria-label="מחיקת שורה" title="מחיקה">✕</button>
                </div>

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
                  <select className={styles.input} value={r.guests_count || 1} onChange={e => editRow(r.id, { guests_count: Number(e.target.value) })}>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? "מקום" : "מקומות"}</option>)}
                  </select>
                </div>

                {complete
                  ? <div className={styles.rowOk}>✓ מלאה — מסונכרנת לרשימה</div>
                  : <div className={styles.rowWarn}>⚠ חסר: {miss.join(", ")} — לא תסתנכרן עד שיושלם</div>}
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
