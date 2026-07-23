import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchGuestSubmissions, markSubmissionImported } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { uid } from "../utils/uid.js";
import Banner from "../components/feedback/Banner.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import Icon from "../components/ui/Icon.jsx";
import base from "../styles/screenBase.module.css";

const normName = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();

export default function CollabReviewScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  const [subs, setSubs] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error | offline

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !ev.cloudId) { setLoadState("offline"); return; }
    setLoadState("loading");
    try { setSubs(await fetchGuestSubmissions(ev.cloudId)); setLoadState("ready"); }
    catch { setLoadState("error"); }
  }, [ev.cloudId]);

  useEffect(() => { load(); }, [load]);

  const existingNames = useMemo(
    () => new Set((ev.guests || []).map(g => normName(g.name))),
    [ev.guests],
  );

  const pending = subs.filter(s => !s.imported);
  const importable = pending.filter(s => !existingNames.has(normName(s.name))).length;

  const importOne = useCallback(async (s) => {
    const g = {
      id: uid(),
      name: (s.name || "").trim(),
      side: s.side === "groom" ? "groom" : "bride",
      group: s.guest_group || "משפחה קרובה",
      count: s.guests_count || 1,
      phone: s.phone || "",
      notes: s.submitted_by ? `נוסף ע"י ${s.submitted_by}` : "",
      rsvp: "pending",
      meal: "regular",
      companions: [],
    };
    patchEvent(e => ({ ...e, guests: [...e.guests, g] }));
    await markSubmissionImported(s.id);
    setSubs(prev => prev.map(x => x.id === s.id ? { ...x, imported: true } : x));
    showToast(`הוספתם את "${g.name}" ✓`);
  }, [patchEvent, showToast]);

  const importAll = useCallback(async () => {
    const fresh = pending.filter(s => !existingNames.has(normName(s.name)));
    if (!fresh.length) { showToast("אין רשומות חדשות לייבוא", "err"); return; }
    const newGuests = fresh.map(s => ({
      id: uid(), name: (s.name || "").trim(),
      side: s.side === "groom" ? "groom" : "bride",
      group: s.guest_group || "משפחה קרובה",
      count: s.guests_count || 1, phone: s.phone || "",
      notes: s.submitted_by ? `נוסף ע"י ${s.submitted_by}` : "", rsvp: "pending",
      meal: "regular", companions: [],
    }));
    patchEvent(e => ({ ...e, guests: [...e.guests, ...newGuests] }));
    await Promise.all(fresh.map(s => markSubmissionImported(s.id)));
    const ids = new Set(fresh.map(s => s.id));
    setSubs(prev => prev.map(x => ids.has(x.id) ? { ...x, imported: true } : x));
    showToast(`יובאו ${newGuests.length} אורחים ✓`);
  }, [pending, existingNames, patchEvent, showToast]);

  const collabLink = ev.tokens?.collab ? window.location.origin + "/collab/" + ev.tokens.collab : null;

  return (
    <div className={base.page}>
      <PageHeader
        title="הוספות מהמשפחה"
        icon={<Icon name="users" />}
        sub="בני משפחה יכולים להוסיף אורחים דרך קישור — כאן מאשרים ומייבאים אותם לרשימה."
      />

      {collabLink && (
        <div className={base.card}>
          <p className={base.fieldHint}>שתפו את הקישור עם המשפחה כדי שיוסיפו אורחים (עם רשימות נפתחות — בלי טעויות):</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input className={base.input} readOnly value={collabLink} dir="ltr" />
            <button className={base.btnSm} onClick={async () => {
              try { await navigator.clipboard.writeText(collabLink); showToast("הקישור הועתק ✓"); }
              catch { showToast("העתיקו ידנית", "err"); }
            }}>העתיקו</button>
          </div>
        </div>
      )}

      {loadState === "offline" && (
        <Banner variant="warn">
          {isSupabaseConfigured
            ? "האירוע עדיין לא סונכרן לענן — הוספות יופיעו כאן אחרי הסנכרון הראשון (התחברו לחשבון)."
            : "סנכרון ענן אינו מוגדר בסביבה זו."}
        </Banner>
      )}
      {loadState === "error" && (
        <Banner variant="err">שגיאה בטעינה — <button className={base.btnSm} onClick={load}>נסו שוב</button></Banner>
      )}
      {loadState === "loading" && <div style={{ padding: 20, color: "var(--muted)" }}>טוען…</div>}

      {loadState === "ready" && pending.length === 0 && (
        <div className={base.card}><p className={base.fieldHint}>עדיין אין הוספות חדשות. שתפו את הקישור למעלה.</p></div>
      )}

      {loadState === "ready" && pending.length > 0 && (
        <>
          <div className={base.actionBar}>
            <button className={base.btnPrimary} onClick={importAll} disabled={importable === 0}>ייבאו את כל החדשים ({importable})</button>
            <button className={base.btnSecondary} onClick={load}>רענון ↺</button>
          </div>
          <div className={base.gList}>
            {pending.map(s => {
              const dup = existingNames.has(normName(s.name));
              return (
                <div key={s.id} className={base.gRow}>
                  <div className={base.gInfo}>
                    <span className={base.gName}>
                      {s.name}
                      {s.guests_count > 1 && <span style={{ color: "var(--muted)", fontSize: 12 }}> · {s.guests_count} מקומות</span>}
                      {dup && <span style={{ color: "var(--warn)", fontSize: 12 }}> · כבר ברשימה</span>}
                    </span>
                    <span className={base.gMeta}>
                      {[s.guest_group, s.phone, s.submitted_by && `נוסף ע"י ${s.submitted_by}`].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <button className={base.btnSm} onClick={() => importOne(s)} disabled={dup}>
                    {dup ? "קיים" : "+ הוסיפו"}
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16 }}>
            <button className={base.btnSecondary} onClick={() => go("guests")}>→ לרשימת האורחים</button>
          </div>
        </>
      )}
    </div>
  );
}
