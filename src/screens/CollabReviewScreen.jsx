import { useState, useEffect, useCallback } from "react";
import { fetchCollabGuestsOwner, subscribeCollabGuests } from "../utils/publicTokens.js";
import { isSupabaseConfigured } from "../lib/supabase.js";
import { getSideLabels } from "../utils/eventHelpers.js";
import Banner from "../components/feedback/Banner.jsx";
import PageHeader from "../components/ui/PageHeader.jsx";
import QrCode from "../components/ui/QrCode.jsx";
import StatPill from "../components/ui/StatPill.jsx";
import base from "../styles/screenBase.module.css";
import styles from "./CollabReviewScreen.module.css";
import Icon from "../components/ui/Icon.jsx";
import { useShareGate } from "../components/share/useShareGate.jsx";

const norm = (s) => (s || "").toString().trim();
const complete = (r) => !!(norm(r.name) && norm(r.phone) && r.side && norm(r.guest_group));

// The shared collaborative table hub. Family members fill the live table via the
// link; complete rows sync into the guest list automatically (useCollabSync), so
// there is no manual import here — just share, watch, and export.
export default function CollabReviewScreen({ activeEvent: ev, patchEvent, go, showToast }) {
  // Sharing is the moment guest mode stops being free. A guest event has no
  // cloud row, so the link resolves to nothing for everyone it is sent to —
  // withholding it is honest; showing it and letting it be copied is not.
  const { guard, gate } = useShareGate();
  const [rows, setRows] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | offline

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !ev.cloudId) { setLoadState("offline"); return; }
    try { setRows(await fetchCollabGuestsOwner(ev.cloudId)); setLoadState("ready"); }
    catch { setLoadState("offline"); }
  }, [ev.cloudId]);

  useEffect(() => { load(); }, [load]);

  // Live counts update as the family edits the table.
  useEffect(() => {
    if (!isSupabaseConfigured || !ev.cloudId) return;
    const unsub = subscribeCollabGuests(ev.cloudId, (payload) => {
      setRows((prev) => {
        if (payload.eventType === "DELETE") return prev.filter((r) => r.id !== payload.old?.id);
        const row = payload.new; if (!row) return prev;
        return prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row];
      });
    });
    return unsub;
  }, [ev.cloudId]);

  const collabLink   = ev.tokens?.collab ? window.location.origin + "/collab/" + ev.tokens.collab : null;
  const collabActive = ev.collabActive !== false;
  const sides = getSideLabels(ev);
  const completeCount = rows.filter(complete).length;

  // Loaded on demand. A static import made the 416KB xlsx chunk a hard
  // dependency of this screen for everyone who opens it, when only the people
  // who press the download button ever need it.
  const downloadExcel = async () => {
    const XLSX = await import("xlsx");
    const aoa = [["שם מלא", "טלפון", "צד", "קבוצה", "כמות"]];
    (ev.guests || []).forEach((g) => aoa.push([g.name || "", g.phone || "", sides[g.side] || "", g.group || "", g.count || 1]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 16 }, { wch: 7 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "רשימת אורחים");
    XLSX.writeFile(wb, `אורחים-${(ev.name || "אירוע").replace(/[^\p{L}\p{N} -]/gu, "")}.xlsx`);
  };

  return (
    <div className={base.page}>
      <PageHeader
        title="טבלה שיתופית"
        mark="collab"
        sub={`שתפו קישור אחד עם ${ev.type === "אירוע עסקי" ? "הצוות" : "המשפחה"} — כולם ממלאים את אותה טבלה יחד, בזמן אמת. כל רשומה מלאה נכנסת אוטומטית לרשימת האורחים.`}
      />

      {collabLink ? (
        <div className={base.card}>
          {/* The link is a full-control capability — whoever holds it can read
              every phone number, edit, delete and export. It is minted once and
              never changes, so a forward in a family group is permanent. The
              switch is how it gets taken back: same link, on or off. Enforced
              in the token RPCs, not here — a toggle that only hides a button
              would be decoration. */}
          <div className={styles.linkSwitch}>
            <div className={styles.linkSwitchText}>
              <span className={styles.linkSwitchTitle}>
                {collabActive ? "הקישור פעיל" : "הקישור סגור"}
              </span>
              <span className={styles.linkSwitchHint}>
                {collabActive
                  ? "כל מי שיש לו את הקישור יכול למלא ולערוך את הטבלה"
                  : "אותו קישור יפסיק לענות לכולם. אפשר להחזיר אותו בכל רגע."}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={collabActive}
              aria-label="קישור הטבלה השיתופית פעיל"
              className={[styles.switch, collabActive ? styles.switchOn : ""].filter(Boolean).join(" ")}
              onClick={() => {
                patchEvent({ collabActive: !collabActive });
                showToast(collabActive ? "הקישור נסגר" : "הקישור פעיל שוב ✓");
              }}
            >
              <span className={styles.switchKnob} />
            </button>
          </div>

          {/* Said in terms of what the person on the other end will do with it,
              not in terms of what the feature is called. */}
          <p className={base.fieldHint}>
            שלחו את הקישור הזה בוואטסאפ. כל מי שפותח אותו מוסיף את המוזמנים שלו לאותה טבלה,
            בלי הרשמה ובלי סיסמה — וכל שורה שהושלמה מופיעה ברשימת האורחים שלכם מיד:
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className={base.input} readOnly value={collabLink} dir="ltr" aria-label="קישור לטבלה השיתופית" />
            <button className={base.btnSm} onClick={() => guard("הקישור לטבלה השיתופית", async () => {
              try { await navigator.clipboard.writeText(collabLink); showToast("הקישור הועתק ✓"); }
              catch { showToast("העתיקו ידנית", "err"); }
            })}>העתיקו</button>
            <QrCode url={collabLink} label="טבלה שיתופית" filename="qr-collab" />
          </div>
          <div className={base.actionBar} style={{ marginTop: 14 }}>
            <button className={base.btnPrimary} onClick={() => guard("הקישור לטבלה השיתופית",
              () => window.open(collabLink, "_blank", "noopener,noreferrer"))}>
              פתחו את הטבלה <Icon name="arrowLeft" size={15} />
            </button>
            <button className={base.btnSecondary} onClick={downloadExcel} disabled={!(ev.guests || []).length}><Icon name="download" /> הורדה לאקסל</button>
          </div>
        </div>
      ) : (
        <Banner variant="warn">הקישור ייווצר אוטומטית — שמרו את האירוע והתחברו לחשבון כדי לסנכרן לענן.</Banner>
      )}

      {loadState === "offline" && (
        <Banner variant="warn">
          {isSupabaseConfigured
            ? "האירוע עדיין לא סונכרן לענן — הטבלה השיתופית תתחיל לעבוד אחרי הסנכרון הראשון (התחברו לחשבון)."
            : "סנכרון ענן אינו מוגדר בסביבה זו."}
        </Banner>
      )}

      {loadState === "ready" && (
        <div className={base.card}>
          <div className={base.pills}>
            <StatPill n={rows.length} label="רשומות בטבלה" primary />
            <StatPill n={completeCount} label="מלאות ומסונכרנות" color="var(--green)" />
            {rows.length - completeCount > 0 && (
              <StatPill n={rows.length - completeCount} label="ממתינות להשלמה" color="var(--warn)" />
            )}
          </div>
          <p className={base.fieldHint} style={{ marginTop: 12 }}>
            הרשומות המלאות כבר ברשימת האורחים שלכם — הכל מתעדכן אוטומטית בשני הכיוונים.
          </p>
          <div style={{ marginTop: 14 }}>
            <button className={base.btnSecondary} onClick={() => go("guests")}><Icon name="arrowLeft" size={15} /> לרשימת האורחים</button>
          </div>
        </div>
      )}
      {gate}
    </div>
  );
}
