import { useState, useEffect, useCallback } from "react";
import {Link} from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import Icon from "../../components/ui/Icon.jsx";
import SectionMark from "../../components/ui/SectionMark.jsx";
import Loading from "../../components/feedback/Loading.jsx";
import { formatDateTime, shortAgent } from "../lib/adminFormat.js";
import { loadQueue, unseenSummary } from "../lib/workQueue.js";
import styles from "./AdminErrorsScreen.module.css";

// Crashes, as they happen, in one list.
//
// Until this screen existed an exception on a customer's phone went to that
// browser's console and disappeared — the owner heard about it only if the
// couple happened to call. An event happens once, so "we'll reproduce it later"
// is not available.
//
// Deliberately small: what broke, where, when, and whether it has been looked
// at. Grouping and release tracking are what a real error service would add,
// and are worth paying for only if the volume ever justifies it.

const KIND_LABEL = {
  render:  "רינדור",
  window:  "שגיאה גלובלית",
  promise: "הבטחה שנדחתה",
};

// A work queue, loaded so nothing unread hides outside the window — see
// admin/lib/workQueue.js (WORKPLAN 58).
function loadErrors() {
  return loadQueue(supabase, "error_reports", "id, created_at, message, stack, route, user_agent, kind, seen");
}

export default function AdminErrorsScreen() {
  const [rows,  setRows]  = useState([]);
  // The table's own count of unread rows; null when it could not be read.
  const [unseenTotal, setUnseenTotal] = useState(null);
  const [state, setState] = useState("loading");   // loading | ready | error
  const [err,   setErr]   = useState("");
  const [open,  setOpen]  = useState(null);
  const [onlyUnseen, setOnlyUnseen] = useState(true);

  const load = useCallback(async () => {
    setState("loading");
    setErr("");   // a retry that works must not leave the old failure up
    try { const q = await loadErrors(); setRows(q.rows); setUnseenTotal(q.unseenTotal); setState("ready"); }
    catch (e) { setErr(e.message || String(e)); setState("error"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markSeen = async (id) => {
    // Optimistic: the list is a work queue, and waiting for a round-trip to
    // cross something off is the wrong feel.
    const was = rows.find(r => r.id === id);
    if (!was || was.seen) return;
    setRows(prev => prev.map(r => (r.id === id ? { ...r, seen: true } : r)));
    setUnseenTotal(n => (n == null ? n : Math.max(0, n - 1)));
    const { error } = await supabase.from("error_reports").update({ seen: true }).eq("id", id);
    if (error) {
      setRows(prev => prev.map(r => (r.id === id ? { ...r, seen: false } : r)));
      setUnseenTotal(n => (n == null ? n : n + 1));
      setErr(`סימון הדיווח נכשל: ${error.message}`);
    }
  };

  const shown  = onlyUnseen ? rows.filter(r => !r.seen) : rows;
  const unseen = rows.filter(r => !r.seen).length;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Link to="/admin/dashboard" className={styles.back} aria-label="חזרה לדשבורד">
          <Icon name="arrowRight" size={16} />
        </Link>
        <SectionMark name="alert" size={26} tone="admin" tile />
        <div>
          <h1 className={styles.title}>שגיאות</h1>
          <p className={styles.sub}>מה נשבר אצל מישהו, איפה ומתי. הכתובות מנוקות מטוקנים לפני השמירה.</p>
        </div>
        <button className={styles.refresh} onClick={load}>
          <Icon name="refresh" size={15} /> רענון
        </button>
      </header>

      {err && (
        <div className={styles.error} role="alert">
          <span>{err}</span>
          <button onClick={load}>נסו שוב</button>
        </div>
      )}

      <div className={styles.toolbar}>
        <span className={styles.count}>
          {state !== "error" && unseenSummary(unseen, unseenTotal, { one: "שגיאה אחת שלא נקראה", many: "שגיאות שלא נקראו", none: "אין שגיאות חדשות" })}
        </span>
        <label className={styles.filter}>
          <input
            type="checkbox"
            checked={onlyUnseen}
            onChange={e => setOnlyUnseen(e.target.checked)}
          />
          רק מה שלא נקרא
        </label>
      </div>

      {state === "loading" ? (
        <Loading rows={5} label="טוענים שגיאות…" />
      ) : state === "error" ? null : shown.length === 0 ? (
        /* Not on a failed load: it said "הכל נקרא" under the error, which is
           the one thing a failed read cannot know (second review, סב19). */
        <div className={styles.empty}>
          <SectionMark name="alert" size={30} tone="admin" tile />
          <p className={styles.emptyTitle}>{onlyUnseen ? (unseenTotal > 0 ? "יש עוד שלא נטענו" : "הכל נקרא") : "לא נרשמה אף שגיאה"}</p>
          <p className={styles.emptyHint}>
            {onlyUnseen
              ? (unseenTotal > 0
                  ? `עוד ${unseenTotal} שלא נקראו מחכות בטבלה — רעננו כדי לטעון אותם.`
                  : "אין שגיאות חדשות מאז הפעם האחרונה שבדקת.")
              : "כשמשהו ייפול אצל מישהו — הוא יופיע כאן."}
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {shown.map(r => (
            <li key={r.id} className={[styles.row, r.seen ? styles.rowSeen : ""].filter(Boolean).join(" ")}>
              <div className={styles.rowTop}>
                <span className={styles.msg}>{r.message}</span>
                {!r.seen && <span className={styles.badgeNew}>חדש</span>}
              </div>
              <div className={styles.meta}>
                <span className={styles.route} dir="ltr">{r.route || "—"}</span>
                <span className={styles.dot} aria-hidden="true">·</span>
                <span>{KIND_LABEL[r.kind] || r.kind}</span>
                <span className={styles.dot} aria-hidden="true">·</span>
                <span title={r.user_agent || ""}>{shortAgent(r.user_agent)}</span>
                <span className={styles.dot} aria-hidden="true">·</span>
                {/* dir="ltr": with only digits and neutrals, bidi N1 painted
                    "29.07.2026, 14:32" as "14:32 ,29.07.2026" (measured with
                    Range rects, סב39). Same fix as AdminActivityScreen. */}
                <span dir="ltr">{formatDateTime(r.created_at)}</span>
              </div>
              <div className={styles.rowActions}>
                {r.stack && (
                  <button className={styles.linkBtn} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {open === r.id ? "הסתרת הפירוט" : "פירוט טכני"}
                  </button>
                )}
                {!r.seen && (
                  <button className={styles.linkBtn} onClick={() => markSeen(r.id)}>סימון כנקרא</button>
                )}
              </div>
              {open === r.id && <pre className={styles.stack} dir="ltr">{r.stack}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
