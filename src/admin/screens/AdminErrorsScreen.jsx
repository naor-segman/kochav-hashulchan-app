import { useState, useEffect, useCallback } from "react";
import {Link} from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import Icon from "../../components/ui/Icon.jsx";
import SectionMark from "../../components/ui/SectionMark.jsx";
import Loading from "../../components/feedback/Loading.jsx";
import { formatDateTime } from "../lib/adminFormat.js";
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

async function loadErrors() {
  const { data, error } = await supabase
    .from("error_reports")
    .select("id, created_at, message, stack, route, user_agent, kind, seen")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

// "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 …) Safari/605" → "Safari · iPhone".
// The full string stays in the row's title attribute.
function shortAgent(ua = "") {
  const browser =
    /EdgA?\//.test(ua)                        ? "Edge"
    : /OPR\//.test(ua)                        ? "Opera"
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome"
    : /Firefox\//.test(ua)                    ? "Firefox"
    : /Safari\//.test(ua)                     ? "Safari"
    : "דפדפן";
  const device =
    /iPhone/.test(ua)  ? "iPhone"
    : /iPad/.test(ua)  ? "iPad"
    : /Android/.test(ua) ? "אנדרואיד"
    : /Macintosh/.test(ua) ? "מק"
    : /Windows/.test(ua)   ? "Windows"
    : "";
  return device ? `${browser} · ${device}` : browser;
}

export default function AdminErrorsScreen() {
  const [rows,  setRows]  = useState([]);
  const [state, setState] = useState("loading");   // loading | ready | error
  const [err,   setErr]   = useState("");
  const [open,  setOpen]  = useState(null);
  const [onlyUnseen, setOnlyUnseen] = useState(true);

  const load = useCallback(async () => {
    setState("loading");
    try { setRows(await loadErrors()); setState("ready"); }
    catch (e) { setErr(e.message || String(e)); setState("error"); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markSeen = async (id) => {
    // Optimistic: the list is a work queue, and waiting for a round-trip to
    // cross something off is the wrong feel.
    setRows(prev => prev.map(r => (r.id === id ? { ...r, seen: true } : r)));
    const { error } = await supabase.from("error_reports").update({ seen: true }).eq("id", id);
    if (error) {
      setRows(prev => prev.map(r => (r.id === id ? { ...r, seen: false } : r)));
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
          {unseen === 0 ? "אין שגיאות חדשות" : unseen === 1 ? "שגיאה אחת שלא נקראה" : `${unseen} שגיאות שלא נקראו`}
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
      ) : shown.length === 0 ? (
        <div className={styles.empty}>
          <SectionMark name="alert" size={30} tone="admin" tile />
          <p className={styles.emptyTitle}>{onlyUnseen ? "הכל נקרא" : "לא נרשמה אף שגיאה"}</p>
          <p className={styles.emptyHint}>
            {onlyUnseen
              ? "אין שגיאות חדשות מאז הפעם האחרונה שבדקת."
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
                <span>{formatDateTime(r.created_at)}</span>
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
