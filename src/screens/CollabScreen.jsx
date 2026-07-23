import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { fetchCollabEvent, submitGuestEntry } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { GROUP_OPTIONS } from "../data/constants.js";
import { uid } from "../utils/uid.js";
import { getSideLabels } from "../utils/eventHelpers.js";
import styles from "./CollabScreen.module.css";

// DEV mock so the page can be designed without a live token.
const MOCK = { cloudId: null, name: "חתונת נועה וטל", type: "חתונה", brideName: "נועה", groomName: "טל", coupleType: "bride-groom", sideLabels: null };

export default function CollabScreen() {
  const { token } = useParams();
  const [ev, setEv] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notfound
  const [form, setForm] = useState({ name: "", phone: "", side: "bride", group: "משפחה קרובה", count: 1 });
  const [submittedBy, setSubmittedBy] = useState("");
  const [added, setAdded] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchCollabEvent(token);
      if (cancelled) return;
      if (data) { setEv(data); setState("ready"); }
      else if (!isSupabaseConfigured || import.meta.env.DEV) { setEv(MOCK); setState("ready"); }
      else setState("notfound");
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (state === "loading") return <div className={styles.state}><span className={styles.star}>✦</span><p>טוען…</p></div>;
  if (state === "notfound") return <div className={styles.state}><span className={styles.star}>⚠</span><p>הקישור אינו תקין או שפג תוקפו</p></div>;

  const sides = getSideLabels(ev);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr("יש להזין שם"); return; }
    setErr(""); setBusy(true);
    try {
      if (ev.cloudId) await submitGuestEntry(token, { ...form, name: form.name.trim(), submittedBy: submittedBy.trim() });
      setAdded(a => [{ _k: uid(), name: form.name.trim(), count: form.count, side: form.side }, ...a]);
      setForm(f => ({ ...f, name: "", phone: "", count: 1 }));
    } catch {
      setErr("אירעה שגיאה בשליחה. נסו שוב.");
    } finally { setBusy(false); }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerMark}>✦</span>
        <span className={styles.headerName}>{ev.name || "רשימת אורחים משותפת"}</span>
      </header>

      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>הוספת אורחים לרשימה</h1>
          <p className={styles.sub}>עזרו לבעלי השמחה להשלים את רשימת האורחים — הוסיפו את מי שאתם מכירים. אפשר להוסיף כמה שרוצים.</p>

          <form onSubmit={submit} className={styles.form} noValidate>
            <label className={styles.label}>שם מלא *
              <input className={styles.input} value={form.name} placeholder="שם ושם משפחה"
                onChange={e => set("name", e.target.value)} disabled={busy} />
            </label>

            <div className={styles.row2}>
              <label className={styles.label}>צד
                <select className={styles.input} value={form.side} onChange={e => set("side", e.target.value)} disabled={busy}>
                  <option value="bride">{sides.bride}</option>
                  <option value="groom">{sides.groom}</option>
                </select>
              </label>
              <label className={styles.label}>כמות מקומות
                <input className={styles.input} type="number" min={1} max={30} value={form.count} dir="ltr"
                  onChange={e => set("count", Math.max(1, Math.min(30, Number(e.target.value) || 1)))} disabled={busy} />
              </label>
            </div>

            <label className={styles.label}>קבוצה / קרבה
              <select className={styles.input} value={form.group} onChange={e => set("group", e.target.value)} disabled={busy}>
                {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>

            <label className={styles.label}>טלפון (אופציונלי)
              <input className={styles.input} value={form.phone} placeholder="050-0000000" dir="ltr"
                onChange={e => set("phone", e.target.value)} disabled={busy} />
            </label>

            {err && <p className={styles.err}>{err}</p>}
            <button type="submit" className={styles.btn} disabled={busy || !form.name.trim()}>
              {busy ? "מוסיפים…" : "+ הוסיפו לרשימה"}
            </button>
          </form>
        </div>

        {added.length > 0 && (
          <div className={styles.card}>
            <div className={styles.addedHead}>הוספתם עד כה: {added.length}</div>
            <ul className={styles.addedList}>
              {added.map((g) => (
                <li key={g._k} className={styles.addedRow}>
                  <span className={styles.addedName}>{g.name}</span>
                  <span className={styles.addedMeta}>{sides[g.side]}{g.count > 1 ? ` · ${g.count} מקומות` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.optional}>
          <label className={styles.label}>השם שלכם (אופציונלי) — כדי שבעלי השמחה ידעו מי הוסיף
            <input className={styles.input} value={submittedBy} placeholder="השם שלכם"
              onChange={e => setSubmittedBy(e.target.value)} />
          </label>
        </div>

        <footer className={styles.footer}>✦ נבנה בכוכב השולחן</footer>
      </div>
    </div>
  );
}
