import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase.js";
import Icon from "../../components/ui/Icon.jsx";
import SectionMark from "../../components/ui/SectionMark.jsx";
import Loading from "../../components/feedback/Loading.jsx";
import { formatDateTime, shortAgent } from "../lib/adminFormat.js";
import styles from "./AdminErrorsScreen.module.css";

// What people said, as they said it.  Checklist 25.
//
// The errors screen next to this one shows what CRASHED. This shows what was
// merely wrong — the button nobody found, the wording that misled, the step
// that worked and was still the wrong step. None of those throw, so the only
// way they arrive is if somebody types them.
//
// Same shape as the errors screen on purpose, and the same stylesheet: a work
// queue with an unread filter, not a dashboard. Two layouts for the same job
// is a second thing to keep in step.

const KIND_LABEL = {
  bug:   "לא עובד",
  idea:  "רעיון",
  other: "אחר",
};

async function loadFeedback() {
  const { data, error } = await supabase
    .from("feedback")
    .select("id, created_at, kind, message, contact, route, user_agent, seen")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export default function AdminFeedbackScreen() {
  const [rows,  setRows]  = useState([]);
  const [state, setState] = useState("loading");   // loading | ready | error
  const [err,   setErr]   = useState("");
  const [onlyUnseen, setOnlyUnseen] = useState(true);

  // The refresh button's path: it wants the spinner back.
  const load = useCallback(async () => {
    setState("loading");
    try { setRows(await loadFeedback()); setState("ready"); }
    catch (e) { setErr(e.message || String(e)); setState("error"); }
  }, []);

  /* The first load is written out rather than calling `load()`, for two
     reasons. The codebase carries 24 sites of `useEffect(() => load())` where
     load sets state synchronously — the rule is downgraded to a warning
     because of them, and CLAUDE.md says not to add a 25th. And the `alive`
     guard is worth having on its own: navigating away mid-request otherwise
     sets state on an unmounted screen. State already starts at "loading", so
     nothing is lost by not setting it again here. */
  useEffect(() => {
    let alive = true;
    loadFeedback()
      .then(rows  => { if (alive) { setRows(rows); setState("ready"); } })
      .catch(e => { if (alive) { setErr(e.message || String(e)); setState("error"); } });
    return () => { alive = false; };
  }, []);

  const markSeen = async (id) => {
    // Optimistic, for the same reason as the errors screen: this is a work
    // queue, and waiting for a round-trip to cross something off feels wrong.
    setRows(prev => prev.map(r => (r.id === id ? { ...r, seen: true } : r)));
    const { error } = await supabase.from("feedback").update({ seen: true }).eq("id", id);
    if (error) {
      setRows(prev => prev.map(r => (r.id === id ? { ...r, seen: false } : r)));
      setErr(`סימון ההודעה נכשל: ${error.message}`);
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
        <SectionMark name="help" size={26} tone="admin" tile />
        <div>
          <h1 className={styles.title}>משוב</h1>
          <p className={styles.sub}>מה אנשים כתבו לנו, מאיזה מסך ומאיזה דפדפן. הכתובות מנוקות מטוקנים לפני השמירה.</p>
        </div>
        <button className={styles.refresh} onClick={() => load()}>
          <Icon name="refresh" size={15} /> רענון
        </button>
      </header>

      {err && (
        <div className={styles.error} role="alert">
          <span>{err}</span>
          <button onClick={() => load()}>נסו שוב</button>
        </div>
      )}

      <div className={styles.toolbar}>
        <span className={styles.count}>
          {unseen === 0 ? "אין הודעות חדשות" : unseen === 1 ? "הודעה אחת שלא נקראה" : `${unseen} הודעות שלא נקראו`}
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
        <Loading rows={5} label="טוענים משוב…" />
      ) : shown.length === 0 ? (
        <div className={styles.empty}>
          <SectionMark name="help" size={30} tone="admin" tile />
          <p className={styles.emptyTitle}>{onlyUnseen ? "הכל נקרא" : "עוד לא נשלח משוב"}</p>
          <p className={styles.emptyHint}>
            {onlyUnseen
              ? "אין הודעות חדשות מאז הפעם האחרונה שבדקת."
              : "כשמישהו יכתוב לנו מדף המשוב — זה יופיע כאן."}
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
                <span>{KIND_LABEL[r.kind] || r.kind}</span>
                <span className={styles.dot} aria-hidden="true">·</span>
                <span className={styles.route} dir="ltr">{r.route || "—"}</span>
                <span className={styles.dot} aria-hidden="true">·</span>
                <span title={r.user_agent || ""}>{shortAgent(r.user_agent)}</span>
                <span className={styles.dot} aria-hidden="true">·</span>
                <span>{formatDateTime(r.created_at)}</span>
              </div>
              <div className={styles.rowActions}>
                {/* The only reason contact is collected, shown where the reply
                    would be written. `dir="ltr"` because an email or a phone
                    number reverses inside an RTL line. */}
                {r.contact && (
                  <span className={styles.route} dir="ltr">{r.contact}</span>
                )}
                {!r.seen && (
                  <button className={styles.linkBtn} onClick={() => markSeen(r.id)}>סימון כנקרא</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
